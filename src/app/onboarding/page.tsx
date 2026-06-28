import { redirect } from "next/navigation";

import { createAgencyWorkspaceAction } from "@/lib/actions/onboarding";
import { getAuthProfileState } from "@/lib/auth/require-profile";
import { BrandLockup } from "@/components/layout/brand-lockup";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const state = await getAuthProfileState();
  const params = await searchParams;

  if (state.status === "signed_out") {
    redirect("/login?message=Please%20sign%20in%20to%20continue.");
  }

  if (state.status === "ready") {
    redirect("/dashboard");
  }

  return (
    <main className="app-shell auth-page">
      <section className="panel auth-card">
        <BrandLockup />
        <h1>Create agency workspace</h1>
        <p className="lead">Create your agency workspace to continue.</p>
        {params.message ? <div className="alert info">{params.message}</div> : null}
        {params.error ? <div className="alert error">{params.error}</div> : null}
        <form action={createAgencyWorkspaceAction} className="form-grid single">
          <label>
            Agency name
            <input name="agency_name" required placeholder="BrightPath Consultants" />
          </label>
          <label>
            Owner name
            <input name="owner_name" required placeholder="Your full name" />
          </label>
          <label>
            Phone optional
            <input name="phone" placeholder="+923001234567" />
          </label>
          <button className="button" type="submit">
            Create workspace
          </button>
        </form>
        {process.env.NODE_ENV === "development" ? (
          <div className="alert info">
            Development helper: use this form to create a demo agency workspace for the signed-in user.
          </div>
        ) : null}
      </section>
    </main>
  );
}
