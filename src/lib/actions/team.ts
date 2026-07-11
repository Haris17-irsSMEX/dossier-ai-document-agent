"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import {
  canAssignStudentToCounselor,
  canManageAgencyUser,
  normalizeRole,
  requireAgencyAdmin,
  requirePlatformAdmin
} from "@/lib/auth/roles";
import { dossierInviteUrl, inviteRedirectUrl } from "@/lib/invites/urls";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const agencySchema = z.object({
  agency_id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Agency name is required."),
  slug: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["active", "suspended", "archived"]).default("active"),
  plan_name: z.string().trim().min(2, "Plan name is required.").default("starter"),
  max_counselors: z.coerce.number().int().min(0).max(100).default(4),
  max_students_per_counselor: z.coerce.number().int().min(1).max(100).default(5)
});

const personSchema = z.object({
  agency_id: z.string().uuid().optional().or(z.literal("")),
  profile_id: z.string().uuid().optional().or(z.literal("")),
  full_name: z.string().trim().min(2, "Full name is required."),
  email: z.string().trim().email("Use a valid email address."),
  phone: z.string().trim().optional().or(z.literal(""))
});

const updateCounselorSchema = z.object({
  profile_id: z.string().uuid(),
  full_name: z.string().trim().min(2, "Full name is required."),
  phone: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["active", "invited", "suspended", "archived"]).default("active")
});

const assignStudentSchema = z.object({
  student_id: z.string().uuid(),
  counselor_id: z.string().uuid()
});

const regenerateInviteSchema = z.object({
  profile_id: z.string().uuid()
});

function emptyToNull(value?: string) {
  return value?.trim() ? value.trim() : null;
}

function redirectWith(path: string, key: "success" | "error", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}

function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

async function createPublicInvite({
  agencyId,
  createdBy,
  email,
  profileId,
  role
}: {
  agencyId: string;
  createdBy: string;
  email: string;
  profileId: string;
  role: "agency_admin" | "counselor";
}) {
  const supabase = createSupabaseAdminClient();

  await supabase
    .from("counselor_invites")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString()
    })
    .eq("profile_id", profileId)
    .eq("status", "pending");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicToken = createInviteToken();
    const { error } = await supabase.from("counselor_invites").insert({
      agency_id: agencyId,
      profile_id: profileId,
      email,
      role,
      public_token: publicToken,
      status: "pending",
      created_by: createdBy,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });

    if (!error) {
      return dossierInviteUrl(publicToken);
    }

    if (!error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
  }

  throw new Error("Could not create a safe invite token.");
}

function redirectWithInvite({
  email,
  inviteLink,
  message,
  path
}: {
  email: string;
  inviteLink: string;
  message: string;
  path: "/team" | "/admin";
}): never {
  const params = new URLSearchParams({
    success: message,
    invite_email: email,
    invite_link: inviteLink
  });

  redirect(`${path}?${params.toString()}`);
}

function activeCounselorCount(
  profiles: Array<{ role: string; status?: string | null; is_active?: boolean | null }>
) {
  return profiles.filter(
    (profile) =>
      normalizeRole(profile.role) === "counselor" &&
      profile.is_active !== false &&
      (profile.status || "active") === "active"
  ).length;
}

function assignedActiveStudentCount(
  students: Array<{
    assigned_counselor_id?: string | null;
    assigned_consultant_id?: string | null;
    status?: string | null;
  }>,
  profileId: string
) {
  return students.filter(
    (student) =>
      student.status !== "archived" &&
      (student.assigned_counselor_id === profileId ||
        student.assigned_consultant_id === profileId)
  ).length;
}

export async function getAdminAgencies() {
  await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();

  const [{ data: agencies, error: agenciesError }, { data: profiles }, { data: students }] =
    await Promise.all([
      supabase
        .from("agencies")
        .select(
          "id, name, slug, status, plan_name, max_counselors, max_students_per_counselor, created_at"
        )
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, agency_id, role, status, is_active"),
      supabase.from("students").select("id, agency_id, status")
    ]);

  if (agenciesError) {
    throw new Error(agenciesError.message);
  }

  return (agencies ?? []).map((agency) => {
    const agencyProfiles = (profiles ?? []).filter(
      (profile) => profile.agency_id === agency.id
    );
    const agencyStudents = (students ?? []).filter(
      (student) => student.agency_id === agency.id
    );

    return {
      ...agency,
      usersCount: agencyProfiles.length,
      counselorsCount: activeCounselorCount(agencyProfiles),
      activeStudentsCount: agencyStudents.filter(
        (student) => student.status !== "archived"
      ).length
    };
  });
}

export async function getAgencyUsage() {
  const profile = await requireAgencyAdmin();
  const supabase = createSupabaseAdminClient();
  const agencyId = profile.agency_id;

  const [{ data: agency }, { data: profiles }, { data: students }] =
    await Promise.all([
      supabase
        .from("agencies")
        .select("id, name, max_counselors, max_students_per_counselor")
        .eq("id", agencyId)
        .single(),
      supabase
        .from("profiles")
        .select("id, role, status, is_active")
        .eq("agency_id", agencyId),
      supabase
        .from("students")
        .select("id, status, assigned_counselor_id, assigned_consultant_id")
        .eq("agency_id", agencyId)
    ]);

  return {
    agency,
    counselorsCount: activeCounselorCount(profiles ?? []),
    maxCounselors: agency?.max_counselors ?? 4,
    maxStudentsPerCounselor: agency?.max_students_per_counselor ?? 5,
    activeStudentsCount: (students ?? []).filter(
      (student) => student.status !== "archived"
    ).length
  };
}

export async function getAgencyTeam() {
  const profile = await requireAgencyAdmin();
  const supabase = createSupabaseAdminClient();
  const agencyId = profile.agency_id;

  const [{ data: agency }, { data: profiles }, { data: students }, { data: invites }] =
    await Promise.all([
      supabase
        .from("agencies")
        .select("id, name, max_counselors, max_students_per_counselor")
        .eq("id", agencyId)
        .single(),
      supabase
        .from("profiles")
        .select("id, full_name, email, phone, role, status, is_active, created_at")
        .eq("agency_id", agencyId)
        .order("full_name"),
      supabase
        .from("students")
        .select("id, full_name, status, assigned_counselor_id, assigned_consultant_id")
        .eq("agency_id", agencyId),
      supabase
        .from("counselor_invites")
        .select("id, profile_id, email, public_token, status, expires_at, created_at")
        .eq("agency_id", agencyId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
    ]);

  const now = Date.now();
  const activeInviteByProfileId = new Map<string, { public_token: string; expires_at?: string | null }>();
  const activeInviteByEmail = new Map<string, { public_token: string; expires_at?: string | null }>();

  for (const invite of invites ?? []) {
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= now) {
      continue;
    }

    if (invite.profile_id && !activeInviteByProfileId.has(invite.profile_id)) {
      activeInviteByProfileId.set(invite.profile_id, invite);
    }

    if (invite.email && !activeInviteByEmail.has(invite.email.toLowerCase())) {
      activeInviteByEmail.set(invite.email.toLowerCase(), invite);
    }
  }

  return {
    agency,
    profiles: (profiles ?? []).map((teamProfile) => ({
      ...teamProfile,
      appRole: normalizeRole(teamProfile.role),
      activeInviteLink:
        activeInviteByProfileId.get(teamProfile.id)?.public_token
          ? dossierInviteUrl(activeInviteByProfileId.get(teamProfile.id)!.public_token)
          : teamProfile.email
            ? activeInviteByEmail.get(teamProfile.email.toLowerCase())?.public_token
              ? dossierInviteUrl(activeInviteByEmail.get(teamProfile.email.toLowerCase())!.public_token)
              : null
            : null,
      activeStudentsCount: assignedActiveStudentCount(
        students ?? [],
        teamProfile.id
      )
    })),
    students: students ?? []
  };
}

export async function createAgencyAction(formData: FormData) {
  const profile = await requirePlatformAdmin();
  const parsed = agencySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/admin", "error", parsed.error.issues[0]?.message || "Invalid agency details.");
  }

  const supabase = createSupabaseAdminClient();
  const input = parsed.data;
  const { data, error } = await supabase
    .from("agencies")
    .insert({
      name: input.name,
      slug: input.slug ? slugify(input.slug) : slugify(input.name),
      status: input.status,
      plan_name: input.plan_name,
      max_counselors: input.max_counselors,
      max_students_per_counselor: input.max_students_per_counselor,
      created_by: profile.id
    })
    .select("id")
    .single();

  if (error) {
    captureAppError(error, { module: "team", action: "agency_create" });
    redirectWith("/admin", "error", error.message);
  }

  await createAuditLog({
    agencyId: data.id,
    actorProfileId: profile.id,
    tableName: "agencies",
    recordId: data.id,
    action: "agency_created",
    newData: input
  });

  revalidatePath("/admin");
  redirectWith("/admin", "success", "Agency created.");
}

export async function updateAgencyAction(formData: FormData) {
  const profile = await requirePlatformAdmin();
  const parsed = agencySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/admin", "error", parsed.error.issues[0]?.message || "Invalid agency details.");
  }

  if (!parsed.data.agency_id) {
    redirectWith("/admin", "error", "Choose an agency to update.");
  }

  const supabase = createSupabaseAdminClient();
  const input = parsed.data;
  const agencyId = input.agency_id as string;
  const { error } = await supabase
    .from("agencies")
    .update({
      name: input.name,
      slug: input.slug ? slugify(input.slug) : null,
      status: input.status,
      plan_name: input.plan_name,
      max_counselors: input.max_counselors,
      max_students_per_counselor: input.max_students_per_counselor
    })
    .eq("id", agencyId);

  if (error) {
    captureAppError(error, {
      module: "team",
      action: "agency_update",
      agencyId
    });
    redirectWith("/admin", "error", error.message);
  }

  await createAuditLog({
    agencyId,
    actorProfileId: profile.id,
    tableName: "agencies",
    recordId: agencyId,
    action: "agency_updated",
    newData: input
  });

  revalidatePath("/admin");
  redirectWith("/admin", "success", "Agency updated.");
}

async function inviteUserProfile({
  agencyId,
  email,
  fullName,
  invitedBy,
  phone,
  role
}: {
  agencyId: string;
  email: string;
  fullName: string;
  invitedBy: string;
  phone?: string | null;
  role: "agency_admin" | "counselor";
}) {
  const supabase = createSupabaseAdminClient();

  const generated = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: fullName,
        agency_id: agencyId,
        role
      },
      redirectTo: inviteRedirectUrl()
    }
  });
  let userId = generated.data.user?.id;

  if (generated.error) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, agency_id, role, status")
      .eq("email", email)
      .maybeSingle();

    if (
      existingProfile?.agency_id === agencyId &&
      existingProfile.status === "invited"
    ) {
      userId = existingProfile.id;
    }
  }

  if (generated.error && !userId) {
    throw new Error(generated.error?.message || "Could not generate invite link.");
  }

  if (!userId) {
    throw new Error("Invite user could not be created.");
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    agency_id: agencyId,
    full_name: fullName,
    email,
    phone,
    role,
    status: "invited",
    is_active: true,
    invited_by: invitedBy
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  const inviteLink = await createPublicInvite({
    agencyId,
    createdBy: invitedBy,
    email,
    profileId: userId,
    role
  });

  return {
    inviteLink,
    userId
  };
}

export async function createAgencyAdminAction(formData: FormData) {
  const profile = await requirePlatformAdmin();
  const parsed = personSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/admin", "error", parsed.error.issues[0]?.message || "Invalid agency admin details.");
  }

  if (!parsed.data.agency_id) {
    redirectWith("/admin", "error", "Choose an agency for this admin.");
  }

  try {
    const invite = await inviteUserProfile({
      agencyId: parsed.data.agency_id,
      email: parsed.data.email,
      fullName: parsed.data.full_name,
      phone: emptyToNull(parsed.data.phone),
      role: "agency_admin",
      invitedBy: profile.id
    });

    await createAuditLog({
      agencyId: parsed.data.agency_id,
      actorProfileId: profile.id,
      tableName: "profiles",
      recordId: invite.userId,
      action: "agency_admin_invited",
      newData: { email: parsed.data.email }
    });

    revalidatePath("/admin");
    redirectWithInvite({
      email: parsed.data.email,
      inviteLink: invite.inviteLink,
      message: "Agency admin invited. Copy the invite link and send it to them.",
      path: "/admin"
    });
  } catch (error) {
    captureAppError(error, {
      module: "team",
      action: "agency_admin_create",
      agencyId: parsed.data.agency_id
    });
    redirectWith(
      "/admin",
      "error",
      error instanceof Error ? error.message : "Could not invite agency admin."
    );
  }

  revalidatePath("/admin");
  redirectWith("/admin", "success", "Agency admin invited.");
}

export async function createCounselorAction(formData: FormData) {
  const profile = await requireAgencyAdmin();
  const parsed = personSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/team", "error", parsed.error.issues[0]?.message || "Invalid counselor details.");
  }

  const usage = await getAgencyUsage();

  if (usage.counselorsCount >= usage.maxCounselors) {
    redirectWith(
      "/team",
      "error",
      `This agency already has the maximum ${usage.maxCounselors} counselor accounts.`
    );
  }

  try {
    const invite = await inviteUserProfile({
      agencyId: profile.agency_id,
      email: parsed.data.email,
      fullName: parsed.data.full_name,
      phone: emptyToNull(parsed.data.phone),
      role: "counselor",
      invitedBy: profile.id
    });

    await createAuditLog({
      agencyId: profile.agency_id,
      actorProfileId: profile.id,
      tableName: "profiles",
      recordId: invite.userId,
      action: "counselor_invited",
      newData: { email: parsed.data.email }
    });

    revalidatePath("/team");
    redirectWithInvite({
      email: parsed.data.email,
      inviteLink: invite.inviteLink,
      message: "Counselor invited. Copy the invite link and send it to the counselor.",
      path: "/team"
    });
  } catch (error) {
    captureAppError(error, {
      module: "team",
      action: "counselor_create",
      agencyId: profile.agency_id
    });
    redirectWith(
      "/team",
      "error",
      error instanceof Error ? error.message : "Could not invite counselor."
    );
  }

  revalidatePath("/team");
  redirectWith("/team", "success", "Counselor invited.");
}

export async function regenerateCounselorInviteAction(formData: FormData) {
  const profile = await requireAgencyAdmin();
  const parsed = regenerateInviteSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/team", "error", "Choose an invited counselor.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, agency_id, email, role, status")
    .eq("id", parsed.data.profile_id)
    .single();

  if (
    !target ||
    !target.email ||
    target.agency_id !== profile.agency_id ||
    normalizeRole(target.role) !== "counselor" ||
    target.status !== "invited"
  ) {
    redirectWith("/team", "error", "Only invited counselors can receive a new invite link.");
  }

  let inviteLink: string;

  try {
    inviteLink = await createPublicInvite({
      agencyId: profile.agency_id,
      createdBy: profile.id,
      email: target.email,
      profileId: target.id,
      role: "counselor"
    });
  } catch (error) {
    redirectWith(
      "/team",
      "error",
      error instanceof Error ? error.message : "Could not regenerate invite link."
    );
  }

  await createAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "profiles",
    recordId: target.id,
    action: "counselor_invite_regenerated",
    newData: { email: target.email }
  });

  revalidatePath("/team");
  redirectWithInvite({
    email: target.email,
    inviteLink,
    message: "Invite link regenerated. Copy it and send it to the counselor.",
    path: "/team"
  });
}

export async function updateCounselorAction(formData: FormData) {
  const profile = await requireAgencyAdmin();
  const parsed = updateCounselorSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/team", "error", parsed.error.issues[0]?.message || "Invalid counselor details.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, agency_id, role, status")
    .eq("id", parsed.data.profile_id)
    .single();

  if (
    !target ||
    !canManageAgencyUser(profile, target) ||
    normalizeRole(target.role) !== "counselor"
  ) {
    redirectWith("/team", "error", "You can only update counselor profiles here.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: emptyToNull(parsed.data.phone),
      status: parsed.data.status,
      is_active: parsed.data.status === "active" || parsed.data.status === "invited"
    })
    .eq("id", parsed.data.profile_id);

  if (error) {
    captureAppError(error, {
      module: "team",
      action: "counselor_update",
      agencyId: profile.agency_id
    });
    redirectWith("/team", "error", error.message);
  }

  await createAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "profiles",
    recordId: parsed.data.profile_id,
    action: "counselor_updated",
    newData: parsed.data
  });

  revalidatePath("/team");
  redirectWith("/team", "success", "Counselor updated.");
}

export async function suspendCounselorAction(formData: FormData) {
  const profile = await requireAgencyAdmin();
  const profileId = String(formData.get("profile_id") || "");
  const supabase = createSupabaseAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, agency_id, role, status")
    .eq("id", profileId)
    .single();

  if (
    !target ||
    !canManageAgencyUser(profile, target) ||
    normalizeRole(target.role) !== "counselor"
  ) {
    redirectWith("/team", "error", "You can only suspend counselor profiles here.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ status: "suspended", is_active: false })
    .eq("id", profileId);

  if (error) {
    redirectWith("/team", "error", error.message);
  }

  await createAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "profiles",
    recordId: profileId,
    action: "counselor_suspended"
  });

  revalidatePath("/team");
  redirectWith("/team", "success", "Counselor suspended.");
}

export async function assignStudentToCounselorAction(formData: FormData) {
  const profile = await requireAgencyAdmin();
  const parsed = assignStudentSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWith("/team", "error", parsed.error.issues[0]?.message || "Invalid assignment.");
  }

  const supabase = createSupabaseAdminClient();
  const [{ data: student }, { data: counselor }, { data: agency }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, agency_id, assigned_counselor_id, assigned_consultant_id")
        .eq("id", parsed.data.student_id)
        .single(),
      supabase
        .from("profiles")
        .select("id, agency_id, role, status")
        .eq("id", parsed.data.counselor_id)
        .single(),
      supabase
        .from("agencies")
        .select("max_students_per_counselor")
        .eq("id", profile.agency_id)
        .single()
    ]);

  if (!student || !counselor || student.agency_id !== profile.agency_id) {
    redirectWith("/team", "error", "Student or counselor not found.");
  }

  if (
    !canAssignStudentToCounselor(profile, counselor) ||
    normalizeRole(counselor.role) !== "counselor"
  ) {
    redirectWith("/team", "error", "Choose an active counselor for student workload.");
  }

  const { data: assignedStudents } = await supabase
    .from("students")
    .select("id, status, assigned_counselor_id, assigned_consultant_id")
    .eq("agency_id", profile.agency_id);
  const activeCount = assignedActiveStudentCount(
    (assignedStudents ?? []).filter(
      (assignedStudent) => assignedStudent.id !== student.id
    ),
    counselor.id
  );
  const limit = agency?.max_students_per_counselor ?? 5;

  if (activeCount >= limit) {
    redirectWith("/team", "error", `This counselor already has ${limit} active students.`);
  }

  const { error } = await supabase
    .from("students")
    .update({
      assigned_counselor_id: counselor.id,
      assigned_consultant_id: counselor.id
    })
    .eq("id", student.id);

  if (error) {
    redirectWith("/team", "error", error.message);
  }

  await createAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "students",
    recordId: student.id,
    action: "student_assigned_to_counselor",
    oldData: {
      assigned_counselor_id: student.assigned_counselor_id,
      assigned_consultant_id: student.assigned_consultant_id
    },
    newData: {
      assigned_counselor_id: counselor.id,
      assigned_consultant_id: counselor.id
    }
  });

  revalidatePath("/team");
  revalidatePath("/students");
  revalidatePath(`/students/${student.id}`);
  redirectWith("/team", "success", "Student assigned.");
}
