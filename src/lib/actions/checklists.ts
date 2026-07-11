"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import { getStudent, requireCurrentProfile } from "@/lib/actions/students";
import {
  acceptedFormatSchema,
  buildSmartChecklistRules,
  checklistStatusSchema,
  requirementLevelSchema,
  uploadTypeSchema
} from "@/lib/checklists/rules";
import {
  checklistPhaseSlugs,
  getChecklistPhase
} from "@/lib/checklists/phases";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureAppError } from "@/lib/monitoring/sentry";

const itemUpdateSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  document_name: z.string().trim().min(2),
  phase_slug: z.enum(checklistPhaseSlugs),
  requirement_level: requirementLevelSchema,
  condition_note: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
  accepted_formats: z.array(acceptedFormatSchema).min(1),
  upload_type: uploadTypeSchema,
  required_parts_text: z.string().optional(),
  ai_validation_enabled: z.coerce.boolean().default(false),
  expiry_validation_enabled: z.coerce.boolean().default(false),
  visible_to_student: z.coerce.boolean().default(false),
  submission_deadline: z.string().optional().or(z.literal(""))
});

const customItemSchema = z.object({
  student_id: z.string().uuid(),
  document_name: z.string().trim().min(2, "Document name is required."),
  phase_slug: z.enum(checklistPhaseSlugs),
  requirement_level: requirementLevelSchema,
  condition_note: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
  accepted_formats: z.array(acceptedFormatSchema).min(1, "Choose at least one format."),
  upload_type: z.enum(["single", "multiple", "front_back", "multi_part", "reference"]),
  required_parts_text: z.string().optional(),
  ai_validation_enabled: z.coerce.boolean().default(false),
  expiry_validation_enabled: z.coerce.boolean().default(false),
  visible_to_student: z.coerce.boolean().default(false),
  submission_deadline: z.string().optional().or(z.literal(""))
});

function parseParts(value?: string) {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      part_name: line.replace(/\s*\(optional\)\s*$/i, ""),
      is_required: !/\(optional\)$/i.test(line)
    }));
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function canonicalDocumentName(value: string) {
  const name = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (name.includes("sponsor") && (name.includes("cnic") || name.includes("passport"))) {
    return "sponsor identity";
  }
  if (name.includes("passport") && !name.includes("photo")) return "passport";
  if (name.includes("cnic") || name.includes("national id")) return "cnic";
  if (name.includes("passport size") && name.includes("photo")) return "photo";
  if (name === "cv" || name.includes("cv resume")) return "cv";
  if (name === "sop" || name.includes("personal statement")) return "sop";
  if (name.includes("bank statement") && !name.includes("business")) return "bank statements";
  if (name.includes("sponsorship affidavit")) return "sponsorship affidavit";
  if (name.includes("visa application form")) return "visa application form";
  if (name.includes("offer letter") || name.includes("admission letter")) return "offer letter";

  return name;
}

export async function listChecklistItems(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("checklist_items")
    .select("*, document_parts(*)")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
    .eq("is_archived", false)
    .order("phase_order")
    .order("item_order")
    .order("created_at");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listRequestedChecklistItems(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("checklist_items")
    .select("*, document_parts(*)")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
    .eq("is_archived", false)
    .eq("is_requested", true)
    .eq("visible_to_student", true)
    .order("phase_order")
    .order("item_order")
    .order("created_at");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function generateChecklistAction(formData: FormData) {
  const studentId = z.string().uuid().parse(formData.get("student_id"));
  const profile = await requireCurrentProfile();
  const student = await getStudent(studentId);
  const supabase = await createSupabaseServerClient();

  const rules = buildSmartChecklistRules({
    targetCountry: student.target_country || student.destination_country,
    programLevel: student.program_level,
    educationBackground: student.education_background,
    sponsorType: student.sponsor_type,
    intake: student.intake,
    deadlineDate: student.deadline_date
  });

  const { data: existing, error: existingError } = await supabase
    .from("checklist_items")
    .select(
      "id, document_name, source_template_key, is_custom, is_archived, created_at, requested_at"
    )
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId);

  if (existingError) {
    redirect(
      `/students/${studentId}/checklist?error=${encodeURIComponent(existingError.message)}`
    );
  }

  const { data: existingDocuments } = await supabase
    .from("documents")
    .select("checklist_item_id")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId);
  const itemIdsWithUploads = new Set(
    (existingDocuments ?? []).map((document) => document.checklist_item_id)
  );
  const claimedIds = new Set<string>();
  const inserts = [];

  for (const rule of rules) {
    const candidates = (existing ?? [])
      .filter(
        (item) =>
          item.is_custom !== true &&
          item.is_archived !== true &&
          !claimedIds.has(item.id) &&
          (item.source_template_key === rule.source_template_key ||
            canonicalDocumentName(item.document_name) ===
              canonicalDocumentName(rule.document_name))
      )
      .sort((left, right) => {
        const uploadDifference =
          Number(itemIdsWithUploads.has(right.id)) -
          Number(itemIdsWithUploads.has(left.id));
        return (
          uploadDifference ||
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        );
      });
    const primary = candidates[0];

    if (!primary) {
      inserts.push(rule);
      continue;
    }

    claimedIds.add(primary.id);
    await supabase
      .from("checklist_items")
      .update({
        source_template_key: rule.source_template_key,
        applies_from_stage: rule.applies_from_stage,
        phase_slug: rule.phase_slug,
        phase_label: rule.phase_label,
        phase_order: rule.phase_order,
        item_order: rule.item_order
      })
      .eq("agency_id", profile.agency_id)
      .eq("id", primary.id);

    const duplicateIdsWithoutUploads = candidates
      .slice(1)
      .filter((item) => !itemIdsWithUploads.has(item.id))
      .map((item) => item.id);

    if (duplicateIdsWithoutUploads.length) {
      await supabase
        .from("checklist_items")
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          is_requested: false,
          counts_toward_completion: false,
          visible_to_student: false
        })
        .eq("agency_id", profile.agency_id)
        .in("id", duplicateIdsWithoutUploads);
    }
  }

  if (inserts.length) {
    const { data: created, error } = await supabase
      .from("checklist_items")
      .insert(
        inserts.map((item) => ({
          ...item,
          agency_id: profile.agency_id,
          student_id: studentId,
          created_by: profile.id,
          is_requested: false,
          visible_to_student: false,
          counts_toward_completion: false,
          requested_at: null,
          requested_by: null
        }))
      )
      .select("id, required_parts");

    if (error) {
      captureAppError(error, {
        module: "checklists",
        action: "checklist_generate",
        agencyId: profile.agency_id,
        studentId
      });
      redirect(`/students/${studentId}/checklist?error=${encodeURIComponent(error.message)}`);
    }

    const partRows =
      created?.flatMap((item) =>
        ((item.required_parts as Array<{ part_name: string; is_required: boolean }>) || []).map(
          (part, index) => ({
            agency_id: profile.agency_id,
            checklist_item_id: item.id,
            part_name: part.part_name,
            is_required: part.is_required,
            sort_order: index
          })
        )
      ) ?? [];

    if (partRows.length) {
      const { error: partsError } = await supabase
        .from("document_parts")
        .insert(partRows);

      if (partsError) {
        captureAppError(partsError, {
          module: "checklists",
          action: "document_parts_create",
          agencyId: profile.agency_id,
          studentId
        });
        redirect(
          `/students/${studentId}/checklist?error=${encodeURIComponent(partsError.message)}`
        );
      }
    }

    await Promise.all(
      (created ?? []).map((item) =>
        writeAuditLog({
          agencyId: profile.agency_id,
          actorProfileId: profile.id,
          tableName: "checklist_items",
          recordId: item.id,
          action: "checklist_item_created",
          metadata: { student_id: studentId, source: "checklist_generation" }
        })
      )
    );
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: studentId,
    action: "checklist_generated",
    metadata: { created_count: inserts.length }
  });

  revalidatePath(`/students/${studentId}/checklist`);
  redirect(
    `/students/${studentId}/checklist?success=${encodeURIComponent("Document options prepared")}`
  );
}

export async function updateChecklistItemAction(formData: FormData) {
  const acceptedFormats = formData.getAll("accepted_formats").map(String);
  const parsed = itemUpdateSchema.safeParse({
    ...Object.fromEntries(formData),
    accepted_formats: acceptedFormats,
    ai_validation_enabled: formData.get("ai_validation_enabled") === "on",
    expiry_validation_enabled: formData.get("expiry_validation_enabled") === "on",
    visible_to_student: formData.get("visible_to_student") === "on"
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid checklist item.");
  }

  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  const requiredParts = input.upload_type === "multi_part" ? parseParts(input.required_parts_text) : [];
  const phase = getChecklistPhase(input.phase_slug);

  const { error } = await supabase
    .from("checklist_items")
    .update({
      document_name: input.document_name,
      phase_slug: phase.slug,
      phase_label: phase.label,
      phase_order: phase.order,
      requirement_level: input.requirement_level,
      is_required: input.requirement_level === "required",
      condition_note: input.condition_note || null,
      instructions: input.instructions || null,
      accepted_formats: input.accepted_formats,
      upload_type: input.upload_type,
      required_parts: requiredParts,
      ai_validation_enabled: input.ai_validation_enabled,
      expiry_validation_enabled: input.expiry_validation_enabled,
      visible_to_student: input.visible_to_student,
      submission_deadline: input.submission_deadline || null
    })
    .eq("agency_id", profile.agency_id)
    .eq("student_id", input.student_id)
    .eq("id", input.id);

  if (error) {
    captureAppError(error, {
      module: "checklists",
      action: "checklist_item_update",
      agencyId: profile.agency_id,
      studentId: input.student_id
    });
    throw new Error(error.message);
  }

  await syncDocumentParts({
    supabase,
    agencyId: profile.agency_id,
    checklistItemId: input.id,
    requiredParts
  });

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: input.id,
    action: "checklist_item_updated",
    newData: input
  });

  revalidatePath(`/students/${input.student_id}/checklist`);
  revalidatePath(`/upload`);
}

async function syncDocumentParts({
  supabase,
  agencyId,
  checklistItemId,
  requiredParts
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  agencyId: string;
  checklistItemId: string;
  requiredParts: Array<{ part_name: string; is_required: boolean }>;
}) {
  const { data: existingParts } = await supabase
    .from("document_parts")
    .select("id, part_name")
    .eq("agency_id", agencyId)
    .eq("checklist_item_id", checklistItemId);
  const byName = new Map(
    (existingParts ?? []).map((part) => [part.part_name.toLowerCase(), part])
  );

  for (const [index, part] of requiredParts.entries()) {
    const existing = byName.get(part.part_name.toLowerCase());

    if (existing) {
      await supabase
        .from("document_parts")
        .update({
          part_name: part.part_name,
          is_required: part.is_required,
          sort_order: index
        })
        .eq("agency_id", agencyId)
        .eq("id", existing.id);
    } else {
      await supabase.from("document_parts").insert({
        agency_id: agencyId,
        checklist_item_id: checklistItemId,
        part_name: part.part_name,
        is_required: part.is_required,
        sort_order: index
      });
    }
  }

  const retainedNames = new Set(requiredParts.map((part) => part.part_name.toLowerCase()));
  const removedPartIds = (existingParts ?? [])
    .filter((part) => !retainedNames.has(part.part_name.toLowerCase()))
    .map((part) => part.id);

  if (!removedPartIds.length) {
    return;
  }

  const { data: usedParts } = await supabase
    .from("documents")
    .select("document_part_id")
    .in("document_part_id", removedPartIds);
  const usedPartIds = new Set(
    (usedParts ?? []).map((document) => document.document_part_id).filter(Boolean)
  );
  const removableIds = removedPartIds.filter((id) => !usedPartIds.has(id));

  if (removableIds.length) {
    await supabase
      .from("document_parts")
      .delete()
      .eq("agency_id", agencyId)
      .in("id", removableIds);
  }
}

export async function addCustomChecklistItemAction(formData: FormData) {
  const acceptedFormats = formData.getAll("accepted_formats").map(String);
  const parsed = customItemSchema.safeParse({
    ...Object.fromEntries(formData),
    accepted_formats: acceptedFormats,
    ai_validation_enabled: formData.get("ai_validation_enabled") === "on",
    expiry_validation_enabled: formData.get("expiry_validation_enabled") === "on",
    visible_to_student: formData.get("visible_to_student") === "on"
  });

  if (!parsed.success) {
    const studentId = String(formData.get("student_id") || "");
    redirect(
      `/students/${studentId}/checklist?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid document request.")}`
    );
  }

  const profile = await requireCurrentProfile();
  const input = parsed.data;
  await getStudent(input.student_id);
  const supabase = await createSupabaseServerClient();
  const phase = getChecklistPhase(input.phase_slug);
  const uploadType =
    input.upload_type === "front_back" || input.upload_type === "multi_part"
      ? "multi_part"
      : input.upload_type === "multiple"
        ? "multiple"
        : "single";
  const requiredParts =
    input.upload_type === "front_back"
      ? [
          { part_name: "Front Side", is_required: true },
          { part_name: "Back Side", is_required: true }
        ]
      : input.upload_type === "multi_part"
        ? parseParts(input.required_parts_text)
        : [];
  const { data: lastItem } = await supabase
    .from("checklist_items")
    .select("item_order")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", input.student_id)
    .eq("phase_slug", phase.slug)
    .order("item_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("checklist_items")
    .insert({
      agency_id: profile.agency_id,
      student_id: input.student_id,
      created_by: profile.id,
      category: "custom",
      document_name: input.document_name,
      phase_slug: phase.slug,
      phase_label: phase.label,
      phase_order: phase.order,
      category_slug: "custom",
      category_label: "Custom Request",
      category_order: 999,
      item_order: (lastItem?.item_order ?? 0) + 1,
      requirement_level: input.requirement_level,
      is_required: input.requirement_level === "required",
      condition_note: input.condition_note || null,
      instructions: input.instructions || null,
      accepted_formats: input.accepted_formats,
      upload_type: uploadType,
      required_parts: requiredParts,
      ai_validation_enabled: input.ai_validation_enabled,
      expiry_validation_enabled: input.expiry_validation_enabled,
      visible_to_student: input.visible_to_student,
      is_custom: true,
      is_archived: false,
      is_requested: true,
      requested_at: new Date().toISOString(),
      requested_by: profile.id,
      counts_toward_completion: true,
      applies_from_stage: phase.slug === "pre_departure"
        ? "pre_departure"
        : phase.slug === "visa_processing"
          ? "visa_processing"
          : phase.slug === "verification_attestation"
            ? "verification_attestation"
            : phase.slug === "admission_offer_stage" ||
                phase.slug === "country_specific_requirements"
              ? "offer_received"
              : phase.slug === "university_application"
                ? "university_application"
                : "profile_collection",
      submission_deadline: input.submission_deadline || null
    })
    .select("id")
    .single();

  if (error || !created) {
    captureAppError(error || new Error("Document request was not created."), {
      module: "checklists",
      action: "custom_document_request_add",
      agencyId: profile.agency_id,
      studentId: input.student_id
    });
    redirect(
      `/students/${input.student_id}/checklist?error=${encodeURIComponent(error?.message || "Could not add document request.")}`
    );
  }

  await syncDocumentParts({
    supabase,
    agencyId: profile.agency_id,
    checklistItemId: created.id,
    requiredParts
  });

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: created.id,
    action: "custom_document_request_added",
    newData: {
      student_id: input.student_id,
      document_name: input.document_name,
      phase_slug: phase.slug,
      requirement_level: input.requirement_level
    }
  });

  revalidatePath(`/students/${input.student_id}/checklist`);
  redirect(
    `/students/${input.student_id}/checklist?success=${encodeURIComponent("Document request added")}`
  );
}

export async function updateChecklistStatusAction(formData: FormData) {
  const parsed = z
    .object({
      id: z.string().uuid(),
      student_id: z.string().uuid(),
      status: checklistStatusSchema
    })
    .parse(Object.fromEntries(formData));
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("checklist_items")
    .update({ status: parsed.status })
    .eq("agency_id", profile.agency_id)
    .eq("id", parsed.id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: parsed.id,
    action: "document_status_changed",
    newData: { status: parsed.status }
  });

  revalidatePath(`/students/${parsed.student_id}/documents`);
  revalidatePath(`/students/${parsed.student_id}/checklist`);
}

const requestStateActionSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid()
});

async function requestChecklistItems({
  studentId,
  itemIds,
  successLabel
}: {
  studentId: string;
  itemIds: string[];
  successLabel: string;
}) {
  const profile = await requireCurrentProfile();
  await getStudent(studentId);
  const supabase = await createSupabaseServerClient();
  const uniqueIds = [...new Set(itemIds)].filter(Boolean);

  if (!uniqueIds.length) {
    redirect(
      `/students/${studentId}/checklist?error=${encodeURIComponent("Select at least one document option.")}`
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("checklist_items")
    .select("id, document_name, is_archived, is_requested")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
    .in("id", uniqueIds);

  if (itemsError) {
    captureAppError(itemsError, {
      module: "checklists",
      action: "document_request_bulk_load",
      agencyId: profile.agency_id,
      studentId
    });
    redirect(`/students/${studentId}/checklist?error=${encodeURIComponent(itemsError.message)}`);
  }

  const requestableIds = (items ?? [])
    .filter((item) => item.is_archived !== true && item.is_requested !== true)
    .map((item) => item.id);

  if (!requestableIds.length) {
    redirect(
      `/students/${studentId}/checklist?success=${encodeURIComponent("Selected documents are already visible to the student.")}`
    );
  }

  const { data: existingDocuments } = await supabase
    .from("documents")
    .select("checklist_item_id")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
    .in("checklist_item_id", requestableIds);
  const itemIdsWithUploads = new Set(
    (existingDocuments ?? []).map((document) => document.checklist_item_id)
  );
  const idsWithoutUploads = requestableIds.filter((id) => !itemIdsWithUploads.has(id));
  const idsWithUploads = requestableIds.filter((id) => itemIdsWithUploads.has(id));
  const requestedAt = new Date().toISOString();
  const baseUpdate = {
    is_requested: true,
    requested_at: requestedAt,
    requested_by: profile.id,
    visible_to_student: true,
    counts_toward_completion: true
  };

  if (idsWithoutUploads.length) {
    const { error } = await supabase
      .from("checklist_items")
      .update({ ...baseUpdate, status: "missing" })
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .in("id", idsWithoutUploads);

    if (error) {
      captureAppError(error, {
        module: "checklists",
        action: "document_request_bulk_activate",
        agencyId: profile.agency_id,
        studentId
      });
      redirect(`/students/${studentId}/checklist?error=${encodeURIComponent(error.message)}`);
    }
  }

  if (idsWithUploads.length) {
    const { error } = await supabase
      .from("checklist_items")
      .update(baseUpdate)
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .in("id", idsWithUploads);

    if (error) {
      captureAppError(error, {
        module: "checklists",
        action: "document_request_bulk_activate",
        agencyId: profile.agency_id,
        studentId
      });
      redirect(`/students/${studentId}/checklist?error=${encodeURIComponent(error.message)}`);
    }
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: studentId,
    action: "document_request_activated",
    metadata: {
      student_id: studentId,
      requested_count: requestableIds.length,
      requested_ids: requestableIds
    }
  });

  revalidateChecklistRequestPaths(studentId);
  redirect(
    `/students/${studentId}/checklist?success=${encodeURIComponent(successLabel)}`
  );
}

export async function activateChecklistItemAction(formData: FormData) {
  const parsed = requestStateActionSchema.parse(Object.fromEntries(formData));
  const profile = await requireCurrentProfile();
  await getStudent(parsed.student_id);
  const supabase = await createSupabaseServerClient();
  const { data: item, error: itemError } = await supabase
    .from("checklist_items")
    .select("id, document_name, status, is_archived")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("id", parsed.id)
    .single();

  if (itemError || !item || item.is_archived) {
    throw new Error("Document request was not found.");
  }

  const { count: uploadCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("checklist_item_id", parsed.id);
  const requestedAt = new Date().toISOString();
  const { error } = await supabase
    .from("checklist_items")
    .update({
      is_requested: true,
      requested_at: requestedAt,
      requested_by: profile.id,
      visible_to_student: true,
      counts_toward_completion: true,
      status: uploadCount ? item.status : "missing"
    })
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("id", parsed.id);

  if (error) {
    captureAppError(error, {
      module: "checklists",
      action: "document_request_activate",
      agencyId: profile.agency_id,
      studentId: parsed.student_id
    });
    throw new Error(error.message);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: parsed.id,
    action: "document_request_activated",
    newData: {
      student_id: parsed.student_id,
      requested_at: requestedAt
    }
  });

  revalidateChecklistRequestPaths(parsed.student_id);
  redirect(
    `/students/${parsed.student_id}/checklist?success=${encodeURIComponent(`${item.document_name} requested from student`)}`
  );
}

export async function bulkRequestChecklistItemsAction(formData: FormData) {
  const studentId = z.string().uuid().parse(formData.get("student_id"));
  const selectedIds = formData.getAll("selected_ids").map(String);

  return requestChecklistItems({
    studentId,
    itemIds: selectedIds,
    successLabel: "Selected documents are now visible to the student."
  });
}

export async function markChecklistItemNotNeededAction(formData: FormData) {
  const parsed = requestStateActionSchema.parse(Object.fromEntries(formData));
  const profile = await requireCurrentProfile();
  await getStudent(parsed.student_id);
  const supabase = await createSupabaseServerClient();
  const { data: item, error: itemError } = await supabase
    .from("checklist_items")
    .select("id, document_name, is_archived")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("id", parsed.id)
    .single();

  if (itemError || !item || item.is_archived) {
    throw new Error("Document request was not found.");
  }

  const { error } = await supabase
    .from("checklist_items")
    .update({
      is_requested: false,
      requested_at: null,
      requested_by: null,
      visible_to_student: false,
      counts_toward_completion: false
    })
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("id", parsed.id);

  if (error) {
    captureAppError(error, {
      module: "checklists",
      action: "document_request_not_needed",
      agencyId: profile.agency_id,
      studentId: parsed.student_id
    });
    throw new Error(error.message);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: parsed.id,
    action: "document_request_marked_not_needed",
    newData: { student_id: parsed.student_id }
  });

  revalidateChecklistRequestPaths(parsed.student_id);
  redirect(
    `/students/${parsed.student_id}/checklist?success=${encodeURIComponent(`${item.document_name} is no longer requested from the student`)}`
  );
}

function revalidateChecklistRequestPaths(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/checklist`);
  revalidatePath(`/students/${studentId}/documents`);
  revalidatePath(`/students/${studentId}/export`);
  revalidatePath("/dashboard");
}

export async function archiveChecklistItemAction(formData: FormData) {
  const parsed = z
    .object({
      id: z.string().uuid(),
      student_id: z.string().uuid()
    })
    .parse(Object.fromEntries(formData));
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("checklist_items")
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      visible_to_student: false,
      is_requested: false,
      counts_toward_completion: false
    })
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("id", parsed.id);

  if (error) {
    captureAppError(error, {
      module: "checklists",
      action: "checklist_item_archive",
      agencyId: profile.agency_id,
      studentId: parsed.student_id
    });
    throw new Error(error.message);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: parsed.id,
    action: "checklist_item_archived",
    metadata: { student_id: parsed.student_id }
  });

  revalidatePath(`/students/${parsed.student_id}/checklist`);
  revalidatePath(`/students/${parsed.student_id}`);
  redirect(
    `/students/${parsed.student_id}/checklist?success=${encodeURIComponent("Document request archived")}`
  );
}

export async function generateUploadTokenAction(formData: FormData) {
  const studentId = z.string().uuid().parse(formData.get("student_id"));
  const profile = await requireCurrentProfile();
  await getStudent(studentId);
  const supabase = await createSupabaseServerClient();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const { error } = await supabase.from("upload_tokens").insert({
    agency_id: profile.agency_id,
    student_id: studentId,
    token_hash: tokenHash(token),
    max_uploads: 50,
    expires_at: expiresAt,
    created_by: profile.id
  });

  if (error) {
    captureAppError(error, {
      module: "checklists",
      action: "upload_token_create",
      agencyId: profile.agency_id,
      studentId
    });
    redirect(`/students/${studentId}/checklist?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "upload_tokens",
    recordId: studentId,
    action: "upload_token_created"
  });

  revalidatePath(`/students/${studentId}/checklist`);
  redirect(
    `/students/${studentId}/checklist?uploadToken=${encodeURIComponent(token)}&uploadExpiresAt=${encodeURIComponent(expiresAt)}`
  );
}
