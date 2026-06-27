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
  uploadTypeSchema
} from "@/lib/checklists/rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureAppError } from "@/lib/monitoring/sentry";

const itemUpdateSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  document_name: z.string().trim().min(2),
  is_required: z.coerce.boolean().default(false),
  instructions: z.string().trim().optional(),
  accepted_formats: z.array(acceptedFormatSchema).min(1),
  upload_type: uploadTypeSchema,
  required_parts_text: z.string().optional(),
  ai_validation_enabled: z.coerce.boolean().default(false),
  expiry_validation_enabled: z.coerce.boolean().default(false),
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

export async function listChecklistItems(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("checklist_items")
    .select("*, document_parts(*)")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
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
    deadlineDate: student.deadline_date
  });

  const { data: existing } = await supabase
    .from("checklist_items")
    .select("document_name")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId);
  const existingNames = new Set((existing ?? []).map((item) => item.document_name));
  const inserts = rules.filter((item) => !existingNames.has(item.document_name));

  if (inserts.length) {
    const { data: created, error } = await supabase
      .from("checklist_items")
      .insert(
        inserts.map((item) => ({
          ...item,
          agency_id: profile.agency_id,
          student_id: studentId,
          created_by: profile.id
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
  redirect(`/students/${studentId}/checklist?success=Checklist generated`);
}

export async function updateChecklistItemAction(formData: FormData) {
  const acceptedFormats = formData.getAll("accepted_formats").map(String);
  const parsed = itemUpdateSchema.safeParse({
    ...Object.fromEntries(formData),
    accepted_formats: acceptedFormats,
    is_required: formData.get("is_required") === "on",
    ai_validation_enabled: formData.get("ai_validation_enabled") === "on",
    expiry_validation_enabled: formData.get("expiry_validation_enabled") === "on"
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid checklist item.");
  }

  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  const requiredParts = input.upload_type === "multi_part" ? parseParts(input.required_parts_text) : [];

  const { error } = await supabase
    .from("checklist_items")
    .update({
      document_name: input.document_name,
      is_required: input.is_required,
      instructions: input.instructions || null,
      accepted_formats: input.accepted_formats,
      upload_type: input.upload_type,
      required_parts: requiredParts,
      ai_validation_enabled: input.ai_validation_enabled,
      expiry_validation_enabled: input.expiry_validation_enabled,
      submission_deadline: input.submission_deadline || null
    })
    .eq("agency_id", profile.agency_id)
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

  await supabase
    .from("document_parts")
    .delete()
    .eq("agency_id", profile.agency_id)
    .eq("checklist_item_id", input.id);

  if (requiredParts.length) {
    await supabase.from("document_parts").insert(
      requiredParts.map((part, index) => ({
        agency_id: profile.agency_id,
        checklist_item_id: input.id,
        part_name: part.part_name,
        is_required: part.is_required,
        sort_order: index
      }))
    );
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: input.id,
    action: "checklist_item_updated",
    newData: input
  });

  revalidatePath(`/students/${input.student_id}/checklist`);
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

export async function deleteChecklistItemAction(formData: FormData) {
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
    .delete()
    .eq("agency_id", profile.agency_id)
    .eq("student_id", parsed.student_id)
    .eq("id", parsed.id);

  if (error) {
    captureAppError(error, {
      module: "checklists",
      action: "checklist_item_delete",
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
    action: "checklist_item_deleted",
    metadata: { student_id: parsed.student_id }
  });

  revalidatePath(`/students/${parsed.student_id}/checklist`);
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
