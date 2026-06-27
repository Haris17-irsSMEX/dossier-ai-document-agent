"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthProfileState } from "@/lib/auth/require-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email("Use a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters.")
});

function redirectAuthError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData) {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectAuthError("/login", parsed.error.issues[0]?.message || "Invalid login.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirectAuthError("/login", error.message);
  }

  const state = await getAuthProfileState();

  if (state.status === "ready") {
    redirect("/dashboard");
  }

  redirect("/onboarding?message=Create%20your%20agency%20workspace%20to%20continue.");
}

export async function signupAction(formData: FormData) {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectAuthError("/signup", parsed.error.issues[0]?.message || "Invalid signup.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    redirectAuthError("/signup", error.message);
  }

  redirect("/onboarding?message=Create%20your%20agency%20workspace%20to%20continue.");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?message=Please%20sign%20in%20to%20continue.");
}
