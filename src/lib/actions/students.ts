"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import {
  getAuthProfileState
} from "@/lib/auth/require-profile";
import {
  canAccessStudent,
  canAssignStudentToCounselor,
  isAgencyAdmin,
  isPlatformAdmin,
  normalizeRole,
  requireAgencyMember,
  type RoleProfile
} from "@/lib/auth/roles";
import {
  isActiveChecklistRequest,
  isChecklistReady,
  isMissingActiveRequest,
  needsChecklistReview,
  summarizeChecklist
} from "@/lib/checklists/request-logic";
import { buildSmartChecklistRules } from "@/lib/checklists/rules";
import {
  normalizeEducationBackground,
  parseEducationCompleted,
  serializeEducationBackground
} from "@/lib/students/education-background";
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

const updateStudentSchema = z.object({
  student_id: z.string().uuid(),
  full_name: z.string().trim().min(2, "Student name is required."),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  target_country: z.string().trim().min(2, "Target country is required."),
  intake: z.string().trim().min(2, "Intake is required."),
  program_level: z.string().trim().min(2, "Program level is required."),
  education_background: z.string().trim().min(2, "Education background is required."),
  sponsor_type: z.string().trim().min(2, "Sponsor type is required."),
  assigned_consultant_id: z.string().uuid("Choose a consultant."),
  deadline_date: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "archived"]).optional().or(z.literal(""))
});

function emptyToNull(value?: string) {
  return value?.trim() ? value.trim() : null;
}

function normalizePhone(value?: string) {
  const phone = value?.trim();

  if (!phone) {
    return null;
  }

  return phone.replace(/\s+/g, " ");
}

function getEducationBackgroundFromFormData(formData: FormData) {
  const selectedValues = formData
    .getAll("education_background_values")
    .map((value) => String(value));
  const otherText = String(formData.get("education_background_other") || "");

  if (selectedValues.length) {
    const serialized = serializeEducationBackground(selectedValues, otherText);

    return parseEducationCompleted(serialized).length ? serialized : "";
  }

  const normalizedEducationBackground = normalizeEducationBackground(
    String(formData.get("education_background") || "")
  );

  return parseEducationCompleted(normalizedEducationBackground).length
    ? normalizedEducationBackground
    : "";
}

export async function getCurrentProfile() {
  const state = await getAuthProfileState();
  return state.status === "ready" ? state.profile : null;
}

export async function requireCurrentProfile() {
  return requireAgencyMember();
}

async function getAgencyStudentLimit(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  agencyId: string
) {
  const { data } = await supabase
    .from("agencies")
    .select("max_students_per_counselor")
    .eq("id", agencyId)
    .maybeSingle();

  return Number(data?.max_students_per_counselor || 5);
}

async function countAssignedActiveStudents(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  counselorId: string,
  agencyId: string,
  exceptStudentId?: string
) {
  let query = supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .neq("status", "archived")
    .or(
      `assigned_counselor_id.eq.${counselorId},assigned_consultant_id.eq.${counselorId}`
    );

  if (exceptStudentId) {
    query = query.neq("id", exceptStudentId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function resolveStudentAssignee({
  agencyId,
  currentStudentId,
  profile,
  requestedAssigneeId,
  supabase
}: {
  agencyId: string;
  currentStudentId?: string;
  profile: RoleProfile;
  requestedAssigneeId?: string | null;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  const requestedId =
    isPlatformAdmin(profile) || isAgencyAdmin(profile)
      ? requestedAssigneeId || profile.id
      : profile.id;

  if (!requestedId) {
    throw new Error("Choose a counselor.");
  }

  if (!isPlatformAdmin(profile) && !isAgencyAdmin(profile) && requestedId !== profile.id) {
    throw new Error("Counselors can only assign students to themselves.");
  }

  const { data: counselor, error } = await supabase
    .from("profiles")
    .select("id, agency_id, full_name, email, role, status, is_active")
    .eq("id", requestedId)
    .maybeSingle();

  if (error || !counselor) {
    throw new Error("Selected counselor was not found.");
  }

  if (!isPlatformAdmin(profile) && counselor.agency_id !== profile.agency_id) {
    throw new Error("Selected counselor is not in your agency.");
  }

  if (counselor.is_active === false || counselor.status === "suspended" || counselor.status === "archived") {
    throw new Error("Selected counselor is not active.");
  }

  if (
    (isPlatformAdmin(profile) || isAgencyAdmin(profile)) &&
    !canAssignStudentToCounselor(profile, counselor)
  ) {
    throw new Error("You do not have permission to assign this counselor.");
  }

  if (normalizeRole(counselor.role) === "counselor") {
    const limit = await getAgencyStudentLimit(supabase, agencyId);
    const activeCount = await countAssignedActiveStudents(
      supabase,
      counselor.id,
      agencyId,
      currentStudentId
    );

    if (activeCount >= limit) {
      throw new Error(`This counselor already has ${limit} active students.`);
    }
  }

  return counselor.id;
}

export async function listConsultants() {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("is_active", true)
    .order("full_name");

  if (!isPlatformAdmin(profile)) {
    query = query.eq("agency_id", profile.agency_id);
  }

  if (normalizeRole(profile.role) === "counselor") {
    query = query.eq("id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter(
    (consultant) =>
      consultant.status !== "suspended" && consultant.status !== "archived"
  );
}

export async function listStudents() {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("students")
    .select(
      "*, assigned_consultant:profiles!students_assigned_consultant_agency_fk(full_name, email), assigned_counselor:profiles!students_assigned_counselor_agency_fk(full_name, email), checklist_items(status, is_required, requirement_level, is_requested, counts_toward_completion, is_archived)"
    )
    .order("created_at", { ascending: false });

  if (!isPlatformAdmin(profile)) {
    query = query.eq("agency_id", profile.agency_id);
  }

  if (normalizeRole(profile.role) === "counselor") {
    query = query.or(
      `assigned_counselor_id.eq.${profile.id},assigned_consultant_id.eq.${profile.id}`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getStudent(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("students")
    .select("*, assigned_consultant:profiles!students_assigned_consultant_agency_fk(full_name, email), assigned_counselor:profiles!students_assigned_counselor_agency_fk(full_name, email)")
    .eq("id", studentId);

  if (!isPlatformAdmin(profile)) {
    query = query.eq("agency_id", profile.agency_id);
  }

  const { data, error } = await query.single();

  if (error || !data || !canAccessStudent(profile, data)) {
    throw new Error(error?.message || "Student case not found.");
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

  const profile = await requireAgencyMember();
  const supabase = await createSupabaseServerClient();
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .single();

  if (studentError || !student || !canAccessStudent(profile, student)) {
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
  const parsed = studentSchema.safeParse({
    ...Object.fromEntries(formData),
    education_background: getEducationBackgroundFromFormData(formData)
  });

  if (!parsed.success) {
    redirect(`/students/new?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid student data.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  const normalizedEducationBackground = normalizeEducationBackground(
    input.education_background
  );
  let assigneeId = input.assigned_consultant_id;

  try {
    assigneeId = await resolveStudentAssignee({
      agencyId: profile.agency_id,
      profile,
      requestedAssigneeId: input.assigned_consultant_id,
      supabase
    });
  } catch (assignmentError) {
    const message =
      assignmentError instanceof Error
        ? assignmentError.message
        : "Could not assign this student.";
    redirect(`/students/new?error=${encodeURIComponent(message)}`);
  }

  const { data, error } = await supabase
    .from("students")
    .insert({
      agency_id: profile.agency_id,
      assigned_consultant_id: assigneeId,
      assigned_counselor_id: assigneeId,
      created_by: profile.id,
      full_name: input.full_name,
      phone: emptyToNull(input.phone),
      email: emptyToNull(input.email),
      target_country: input.target_country,
      destination_country: input.target_country,
      intake: input.intake,
      program_level: input.program_level,
      education_background: normalizedEducationBackground,
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
    educationBackground: normalizedEducationBackground,
    sponsorType: input.sponsor_type,
    intake: input.intake,
    deadlineDate: input.deadline_date
  });

  const { data: createdItems, error: checklistError } = await supabase
    .from("checklist_items")
    .insert(
      checklistItems.map((item) => ({
        ...item,
        agency_id: profile.agency_id,
        student_id: data.id,
        created_by: profile.id,
        requested_at: item.is_requested ? new Date().toISOString() : null,
        requested_by: item.is_requested ? profile.id : null
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

export async function updateStudentProfileAction(formData: FormData) {
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

  const parsed = updateStudentSchema.safeParse({
    ...Object.fromEntries(formData),
    education_background: getEducationBackgroundFromFormData(formData)
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message || "Invalid student profile."
    };
  }

  const profile = state.profile;
  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  const normalizedEducationBackground = normalizeEducationBackground(
    input.education_background
  );
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select(
      "id, agency_id, full_name, phone, email, target_country, destination_country, intake, program_level, education_background, sponsor_type, assigned_consultant_id, assigned_counselor_id, deadline_date, status"
    )
    .eq("id", input.student_id)
    .single();

  if (studentError || !student || !canAccessStudent(profile, student)) {
    return {
      ok: false as const,
      error: "You do not have permission to edit this student."
    };
  }

  let assigneeId = student.assigned_counselor_id || student.assigned_consultant_id;

  try {
    assigneeId = await resolveStudentAssignee({
      agencyId: student.agency_id,
      currentStudentId: student.id,
      profile,
      requestedAssigneeId: input.assigned_consultant_id,
      supabase
    });
  } catch (assignmentError) {
    return {
      ok: false as const,
      error:
        assignmentError instanceof Error
          ? assignmentError.message
          : "Could not assign this student."
    };
  }

  const payload = {
    full_name: input.full_name,
    phone: normalizePhone(input.phone),
    email: emptyToNull(input.email),
    target_country: input.target_country,
    destination_country: input.target_country,
    intake: input.intake,
    program_level: input.program_level,
    education_background: normalizedEducationBackground,
    sponsor_type: input.sponsor_type,
    assigned_consultant_id: assigneeId,
    assigned_counselor_id: assigneeId,
    deadline_date: emptyToNull(input.deadline_date),
    status: input.status?.trim() ? input.status.trim() : student.status
  };

  const majorFieldsChanged =
    student.target_country !== payload.target_country ||
    student.intake !== payload.intake ||
    student.program_level !== payload.program_level ||
    student.education_background !== payload.education_background ||
    student.sponsor_type !== payload.sponsor_type;

  const { error: updateError } = await supabase
    .from("students")
    .update(payload)
    .eq("id", input.student_id);

  if (updateError) {
    captureAppError(updateError, {
      module: "students",
      action: "student_profile_update",
      agencyId: profile.agency_id,
      studentId: input.student_id
    });

    return {
      ok: false as const,
      error: "Could not update this student profile right now."
    };
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "students",
    recordId: input.student_id,
    action: "student_profile_updated",
    oldData: student,
    newData: payload
  });

  revalidatePath("/students");
  revalidatePath(`/students/${input.student_id}`);
  revalidatePath(`/students/${input.student_id}/follow-up`);
  revalidatePath(`/students/${input.student_id}/checklist`);
  revalidatePath(`/students/${input.student_id}/documents`);

  return {
    ok: true as const,
    message: "Student profile updated.",
    warning: majorFieldsChanged
      ? "Profile changed. Review document options if needed."
      : null
  };
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
      .select(
        "student_id, status, is_required, requirement_level, is_requested, counts_toward_completion, is_archived, submission_deadline"
      )
      .eq("agency_id", profile.agency_id)
      .eq("is_archived", false),
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
  const summary = summarizeChecklist(items);
  const accepted = summary.active.filter(isChecklistReady).length;
  const missing = summary.active.filter(isMissingActiveRequest).length;
  const problem = summary.active.filter(needsChecklistReview).length;
  const missingStudentIds = new Set(
    items
      .filter(isMissingActiveRequest)
      .map((item) => item.student_id)
  );
  const readyStudentIds = new Set(
    activeStudents
      .filter((student) => {
        const activeItems = items.filter(
          (item) =>
            item.student_id === student.id &&
            isActiveChecklistRequest(item)
        );
        return (
          activeItems.length > 0 &&
          activeItems.every(isChecklistReady)
        );
      })
      .map((student) => student.id)
  );
  const today = new Date();
  const risk = items.filter((item) => {
    if (
      !isActiveChecklistRequest(item) ||
      !item.submission_deadline ||
      isChecklistReady(item)
    ) {
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
    totalChecklistItems: summary.active.length,
    acceptedDocuments: accepted,
    studentsWithMissingDocuments: missingStudentIds.size,
    readyFiles: readyStudentIds.size,
    missingDocuments: missing,
    problemDocuments: problem,
    deadlineRisk: Math.max(risk, studentDeadlineRisk),
    completionPercentage: summary.active.length
      ? Math.round((accepted / summary.active.length) * 100)
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
