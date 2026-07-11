"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { getRoleLandingPath, normalizeRole } from "@/lib/auth/role-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const setPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm_password: z.string().min(8, "Confirm your password.")
  })
  .refine((input) => input.password === input.confirm_password, {
    message: "Passwords must match.",
    path: ["confirm_password"]
  });

function redirectWithError(message: string): never {
  redirect(`/set-password?error=${encodeURIComponent(message)}`);
}

export async function setPasswordAction(formData: FormData) {
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectWithError(parsed.error.issues[0]?.message || "Invalid password.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirectWithError(
      "Your invite session has expired. Ask your senior counselor for a new invite link."
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, agency_id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    redirectWithError("No Dossier profile was found for this invite.");
  }

  if (profile.status === "suspended") {
    redirectWithError("This account is suspended. Contact your agency admin.");
  }

  if (profile.status === "archived") {
    redirectWithError("This account is archived. Contact your agency admin.");
  }

  const role = normalizeRole(profile.role);

  if (role === "platform_admin") {
    redirectWithError("This invite flow is only for agency users.");
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: parsed.data.password
  });

  if (passwordError) {
    redirectWithError(passwordError.message || "Could not update password.");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      status: "active",
      joined_at: now,
      updated_at: now
    })
    .eq("id", user.id);

  if (updateError) {
    redirectWithError("Password was saved, but Dossier could not activate the profile.");
  }

  await supabase
    .from("counselor_invites")
    .update({
      status: "accepted",
      accepted_at: now,
      updated_at: now
    })
    .eq("profile_id", profile.id)
    .eq("status", "pending");

  await createAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "profiles",
    recordId: profile.id,
    action: "profile_invite_accepted",
    newData: {
      status: "active",
      joined_at: now
    }
  });

  redirect(getRoleLandingPath(profile.role));
}
