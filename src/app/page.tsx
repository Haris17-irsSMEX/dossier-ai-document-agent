import { redirect } from "next/navigation";

import { getAuthProfileState } from "@/lib/auth/require-profile";
import { getRoleLandingPath } from "@/lib/auth/role-utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authState = await getAuthProfileState();

  if (authState.status === "ready") {
    redirect(getRoleLandingPath(authState.profile.role));
  }

  if (authState.status === "needs_onboarding") {
    redirect("/onboarding");
  }

  redirect("/login");
}
