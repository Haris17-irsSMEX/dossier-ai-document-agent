"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import {
  getAuthProfileState,
  requireProfileOrRedirect
} from "@/lib/auth/require-profile";
import { buildSmartChecklistRules } from "@/lib/checklists/rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureAppError } from "@/lib/monitoring/sentry";

const studentSchema = z.object({
  full_name: z.string().trim().min(2, "Student name is required."),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Use a valid email.").optional().or(z.literal("")),
  target_country: z.string().trim().min(2, "Target country is required."),
  intake: z.string().trim().min(2, "Intake is required."),
  program_level: z.string().trim().min(2, "Program level is required."),
  education_background: z.string().trim().min(2, "Education background is required."),
  sponsor_type: z.string().trim().min(2, "Sponsor type is required."),
  assigned_consultant_id: z.string().uuid("Choose a consultant."),
  deadline_date: z.string().optional().or(z.literal(""))
});

function emptyToNull(value?: string) {
  return value?.trim() ? value.trim() : null;
}

export async function getCurrentProfile() {
  const state = await getAuthProfileState();
  return state.status === "ready" ? state.profile : null;
}

export async function requireCurrentProfile() {
  return requireProfileOrRedirect();
}

export async function listConsultants() {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("agency_id", profile.agency_id)
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listStudents() {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("students")
    .select(
      "*, assigned_consultant:profiles!students_assigned_consultant_agency_fk(full_name, email), checklist_items(status, is_required)"
    )
    .eq("agency_id", profile.agency_id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getStudent(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("students")
    .select("*, assigned_consultant:profiles!students_assigned_consultant_agency_fk(full_name, email)")
    .eq("agency_id", profile.agency_id)
    .eq("id", studentId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function archiveStudent(studentId: string) {
  const state = await getAuthProfileState();

  if (state.status === "signed_out") {
    return {
      ok: false as const,
      error: "Please sign in to continue."
    };
  }

  if (state.status === "needs_onboarding") {
    return {
      ok: false as const,
      error: "Create your agency workspace to continue."
    };
  }

  const profile = state.profile;
  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .eq("id", studentId)
    .single();

  if (studentError || !student) {
    return {
      ok: false as const,
      error: "Student case not found."
    };
  }

  if (student.status === "archived") {
    return {
      ok: true as const,
      studentName: student.full_name
    };
  }

  const archivedAt = new Date().toISOString();
  const { error: archiveError } = await supabase
    .from("students")
    .update({
      status: "archived",
      archived_at: archivedAt
    })
    .eq("agency_id", profile.agency_id)
    .eq("id", studentId);

  if (archiveError) {
    captureAppError(archiveError, {
      module: "students",
      action: "student_archive",
      agencyId: profile.agency_id,
      studentId
    });

    if (
      archiveError.message.includes("status") ||
      archiveError.message.includes("archived_at")
    ) {
      return {
        ok: false as const,
        error:
          "Student archive fields are not available yet. Run the latest Supabase migration first."
      };
    }

    return {
      ok: false as const,
      error: "Could not archive this student case right now."
    };
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "students",
    recordId: studentId,
    action: "student_archived",
    oldData: {
      status: student.status ?? "active",
      archived_at: student.archived_at ?? null
    },
    newData: {
      status: "archived",
      archived_at: archivedAt
    }
  });

  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath(`/students/${studentId}`);

  return {
    ok: true as const,
    studentName: student.full_name
  };
}

export async function createStudentAction(formData: FormData) {
  const profile = await requireCurrentProfile();
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(`/students/new?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid student data.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  const { data, error } = await supabase
    .from("students")
    .insert({
      agency_id: profile.agency_id,
      assigned_consultant_id: input.assigned_consultant_id,
      created_by: profile.id,
      full_name: input.full_name,
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      target_country: input.target_country,
      destination_country: input.target_country,
      intake: input.intake,
      program_level: input.program_level,
      education_background: input.education_background,
      sponsor_type: input.sponsor_type,
      deadline_date: emptyToNull(input.deadline_date)
    })
    .select("id")
    .single();

  if (error) {
    captureAppError(error, {
      module: "students",
      action: "student_create",
      agencyId: profile.agency_id
    });
    redirect(`/students/new?error=${encodeURIComponent(error.message)}`);
  }

  const checklistItems = buildSmartChecklistRules({
    targetCountry: input.target_country,
    programLevel: input.program_level,
    educationBackground: input.education_background,
    sponsorType: input.sponsor_type,
    deadlineDate: input.deadline_date
  });

  const { data: createdItems, error: checklistError } = await supabase
    .from("checklist_items")
    .insert(
      checklistItems.map((item) => ({
        ...item,
        agency_id: profile.agency_id,
        student_id: data.id,
        created_by: profile.id
      }))
    )
    .select("id, required_parts");

  if (checklistError) {
    captureAppError(checklistError, {
      module: "checklists",
      action: "checklist_generate",
      agencyId: profile.agency_id,
      studentId: data.id
    });
    redirect(`/students/new?error=${encodeURIComponent(checklistError.message)}`);
  }

  const partRows =
    createdItems?.flatMap((item) =>
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
    const { error: partsError } = await supabase.from("document_parts").insert(partRows);

    if (partsError) {
      captureAppError(partsError, {
        module: "checklists",
        action: "document_parts_create",
        agencyId: profile.agency_id,
        studentId: data.id
      });
      redirect(`/students/new?error=${encodeURIComponent(partsError.message)}`);
    }
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "students",
    recordId: data.id,
    action: "student_created",
    newData: input
  });

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "checklist_items",
    recordId: data.id,
    action: "checklist_generated",
    metadata: { created_count: checklistItems.length, source: "student.created" }
  });

  await Promise.all(
    (createdItems ?? []).map((item) =>
      writeAuditLog({
        agencyId: profile.agency_id,
        actorProfileId: profile.id,
        tableName: "checklist_items",
        recordId: item.id,
        action: "checklist_item_created",
        metadata: { student_id: data.id, source: "student_created" }
      })
    )
  );

  revalidatePath("/students");
  revalidatePath("/dashboard");
  redirect(`/students/${data.id}?success=${encodeURIComponent("Student created and checklist generated.")}`);
}

export async function getDashboardMetrics() {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const [
    { data: students },
    { data: checklistItems },
    { data: recentUploads },
    { data: recentWhatsApp },
    { data: recentEmails },
    { data: recentExports }
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("checklist_items")
      .select("student_id, status, is_required, submission_deadline")
      .eq("agency_id", profile.agency_id),
    supabase
      .from("documents")
      .select("id, student_id, original_filename, status, scan_status, created_at")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("whatsapp_messages")
      .select("id, student_id, message_type, status, created_at")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("email_messages")
      .select("id, student_id, subject, status, created_at")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("export_packets")
      .select("id, student_id, status, metadata, created_at")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  const activeStudents = (students ?? []).filter(
    (student) => student.status !== "archived"
  );
  const activeStudentIds = new Set(activeStudents.map((student) => student.id));
  const items = (checklistItems ?? []).filter((item) =>
    activeStudentIds.has(item.student_id)
  );
  const acceptedStatuses = new Set(["accepted", "officially_verified"]);
  const accepted = items.filter((item) => acceptedStatuses.has(item.status)).length;
  const missing = items.filter((item) => item.status === "missing").length;
  const problem = items.filter((item) =>
    [
      "wrong_format",
      "wrong_document",
      "blurry",
      "expired",
      "name_mismatch",
      "needs_review",
      "suspicious",
      "rejected",
      "official_verification_required"
    ].includes(item.status)
  ).length;
  const missingStudentIds = new Set(
    items
      .filter((item) => item.is_required && item.status === "missing")
      .map((item) => item.student_id)
  );
  const readyStudentIds = new Set(
    activeStudents
      .filter((student) => {
        const requiredItems = items.filter(
          (item) => item.student_id === student.id && item.is_required
        );
        return (
          requiredItems.length > 0 &&
          requiredItems.every((item) => acceptedStatuses.has(item.status))
        );
      })
      .map((student) => student.id)
  );
  const today = new Date();
  const risk = items.filter((item) => {
    if (!item.submission_deadline || ["accepted", "officially_verified"].includes(item.status)) {
      return false;
    }
    const deadline = new Date(item.submission_deadline);
    const days = (deadline.getTime() - today.getTime()) / 86400000;
    return days <= 7;
  }).length;
  const studentDeadlineRisk = (students ?? []).filter((student) => {
    if (!student.deadline_date || readyStudentIds.has(student.id)) {
      return false;
    }

    const days =
      (new Date(student.deadline_date).getTime() - today.getTime()) / 86400000;
    return days <= 7;
  }).length;

  return {
    totalStudents: activeStudents.length,
    totalChecklistItems: items.length,
    acceptedDocuments: accepted,
    studentsWithMissingDocuments: missingStudentIds.size,
    readyFiles: readyStudentIds.size,
    missingDocuments: missing,
    problemDocuments: problem,
    deadlineRisk: Math.max(risk, studentDeadlineRisk),
    completionPercentage: items.length
      ? Math.round((accepted / items.length) * 100)
      : 0,
    studentsNeedingAction: activeStudents
      .filter((student) => missingStudentIds.has(student.id))
      .slice(0, 6),
    deadlineStudents: activeStudents
      .filter((student) => {
        if (!student.deadline_date || readyStudentIds.has(student.id)) {
          return false;
        }

        const days =
          (new Date(student.deadline_date).getTime() - today.getTime()) /
          86400000;
        return days <= 7;
      })
      .slice(0, 5),
    recentUploads: recentUploads ?? [],
    recentWhatsApp: recentWhatsApp ?? [],
    recentEmails: recentEmails ?? [],
    recentExports: recentExports ?? []
  };
}
