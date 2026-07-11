import "server-only";

import { redirect } from "next/navigation";

import { getAuthProfileState } from "@/lib/auth/require-profile";
import { normalizeRole, type AppRole } from "@/lib/auth/role-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RoleProfile = {
  id: string;
  agency_id: string;
  full_name: string;
  email?: string | null;
  role: string;
  status?: string | null;
};

export type StudentAccessRecord = {
  agency_id?: string | null;
  assigned_counselor_id?: string | null;
  assigned_consultant_id?: string | null;
};

export { normalizeRole, type AppRole };

export function isPlatformAdmin(profile?: Pick<RoleProfile, "role"> | null) {
  return normalizeRole(profile?.role) === "platform_admin";
}

export function isAgencyAdmin(profile?: Pick<RoleProfile, "role"> | null) {
  return normalizeRole(profile?.role) === "agency_admin";
}

export function isCounselor(profile?: Pick<RoleProfile, "role"> | null) {
  return normalizeRole(profile?.role) === "counselor";
}

export async function getCurrentProfile(): Promise<RoleProfile | null> {
  const state = await getAuthProfileState();

  if (state.status !== "ready") {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, agency_id, full_name, email, role, status")
    .eq("id", state.profile.id)
    .maybeSingle();

  if (error || !data) {
    return {
      ...state.profile,
      status: "active"
    };
  }

  return data;
}

export async function requireAgencyMember(): Promise<RoleProfile> {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login?message=Please%20sign%20in%20to%20continue.");
  }

  if (!profile.agency_id) {
    redirect("/onboarding?message=Create%20your%20agency%20workspace%20to%20continue.");
  }

  if (profile.status === "invited") {
    redirect("/set-password?message=Create%20your%20Dossier%20password%20to%20continue.");
  }

  if (profile.status && profile.status !== "active") {
    redirect("/login?error=Your%20account%20is%20not%20active.");
  }

  return profile;
}

export async function requirePlatformAdmin(): Promise<RoleProfile> {
  const profile = await requireAgencyMember();

  if (!isPlatformAdmin(profile)) {
    redirect("/dashboard?error=Only%20platform%20admins%20can%20open%20that%20area.");
  }

  return profile;
}

export async function requireAgencyAdmin(): Promise<RoleProfile> {
  const profile = await requireAgencyMember();

  if (!isAgencyAdmin(profile)) {
    redirect("/dashboard?error=Only%20agency%20admins%20can%20manage%20the%20team.");
  }

  return profile;
}

export function canManageAgencyUser(
  currentProfile: RoleProfile,
  targetProfile: Pick<RoleProfile, "id" | "agency_id" | "role">
) {
  if (isPlatformAdmin(currentProfile)) {
    return true;
  }

  if (!isAgencyAdmin(currentProfile)) {
    return false;
  }

  if (currentProfile.agency_id !== targetProfile.agency_id) {
    return false;
  }

  return !isPlatformAdmin(targetProfile);
}

export function canAccessStudent(
  currentProfile: RoleProfile,
  student: StudentAccessRecord
) {
  if (isPlatformAdmin(currentProfile)) {
    return true;
  }

  if (!student.agency_id || student.agency_id !== currentProfile.agency_id) {
    return false;
  }

  if (isAgencyAdmin(currentProfile)) {
    return true;
  }

  return (
    student.assigned_counselor_id === currentProfile.id ||
    student.assigned_consultant_id === currentProfile.id
  );
}

export function canAssignStudentToCounselor(
  currentProfile: RoleProfile,
  counselorProfile: Pick<RoleProfile, "agency_id" | "role" | "status">
) {
  if (!isPlatformAdmin(currentProfile) && !isAgencyAdmin(currentProfile)) {
    return false;
  }

  if (
    !isPlatformAdmin(currentProfile) &&
    currentProfile.agency_id !== counselorProfile.agency_id
  ) {
    return false;
  }

  if (counselorProfile.status && counselorProfile.status !== "active") {
    return false;
  }

  return (
    normalizeRole(counselorProfile.role) === "counselor" ||
    normalizeRole(counselorProfile.role) === "agency_admin"
  );
}

export function canSeeTeamNav(profile?: Pick<RoleProfile, "role"> | null) {
  return Boolean(profile && isAgencyAdmin(profile));
}
