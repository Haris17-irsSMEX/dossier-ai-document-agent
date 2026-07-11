import "server-only";

import { redirect } from "next/navigation";

import { getRoleLandingPath } from "@/lib/auth/role-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthProfileState =
  | {
      status: "signed_out";
      user: null;
      profile: null;
    }
  | {
      status: "needs_onboarding";
      user: {
        id: string;
        email?: string;
      };
      profile: null;
    }
  | {
      status: "ready";
      user: {
        id: string;
        email?: string;
      };
      profile: {
        id: string;
        agency_id: string;
        full_name: string;
        email?: string | null;
        role: string;
        status?: string | null;
      };
    };

export async function getAuthProfileState(): Promise<AuthProfileState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: "signed_out",
      user: null,
      profile: null
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, agency_id, full_name, email, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.agency_id) {
    return {
      status: "needs_onboarding",
      user: {
        id: user.id,
        email: user.email
      },
      profile: null
    };
  }

  return {
    status: "ready",
    user: {
      id: user.id,
      email: user.email
    },
    profile
  };
}

export async function requireProfileOrRedirect() {
  const state = await getAuthProfileState();

  if (state.status === "signed_out") {
    redirect("/login?message=Please%20sign%20in%20to%20continue.");
  }

  if (state.status === "needs_onboarding") {
    redirect("/onboarding?message=Create%20your%20agency%20workspace%20to%20continue.");
  }

  return state.profile;
}

export async function redirectIfAuthenticated() {
  const state = await getAuthProfileState();

  if (state.status === "ready") {
    if (state.profile.status === "invited") {
      redirect("/set-password?message=Create%20your%20Dossier%20password%20to%20continue.");
    }

    redirect(getRoleLandingPath(state.profile.role));
  }

  if (state.status === "needs_onboarding") {
    redirect("/onboarding?message=Create%20your%20agency%20workspace%20to%20continue.");
  }
}
