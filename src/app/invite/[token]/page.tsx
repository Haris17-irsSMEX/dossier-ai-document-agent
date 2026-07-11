import Link from "next/link";

import { acceptCounselorInviteAction } from "@/lib/actions/invites";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type InvitePageState =
  | {
      status: "valid";
      agencyName: string;
      email: string;
      roleLabel: string;
      token: string;
    }
  | {
      status: "not_found" | "expired" | "revoked" | "accepted";
      message: string;
    };

async function getInviteState(token: string): Promise<InvitePageState> {
  const supabase = createSupabaseAdminClient();
  const { data: invite } = await supabase
    .from("counselor_invites")
    .select("id, agency_id, email, role, status, expires_at")
    .eq("public_token", token)
    .maybeSingle();

  if (!invite) {
    return {
      status: "not_found",
      message: "Invite link not found."
    };
  }

  if (invite.status === "accepted") {
    return {
      status: "accepted",
      message: "Invite already accepted. Go to sign in."
    };
  }

  if (invite.status === "revoked") {
    return {
      status: "revoked",
      message: "Invite link is no longer active."
    };
  }

  if (
    invite.status === "expired" ||
    new Date(invite.expires_at).getTime() <= Date.now()
  ) {
    await supabase
      .from("counselor_invites")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invite.id);

    return {
      status: "expired",
      message:
        "Invite link expired. Ask your senior counselor to generate a new invite link."
    };
  }

  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", invite.agency_id)
    .maybeSingle();

  return {
    status: "valid",
    agencyName: agency?.name || "this agency",
    email: invite.email,
    roleLabel:
      invite.role === "agency_admin" ? "senior counselor" : "counselor",
    token
  };
}

export default async function InvitePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const state = await getInviteState(token);

  return (
    <main className="app-shell auth-page">
      <section className="panel auth-card">
        <BrandLockup />
        <h1>You have been invited to Dossier.</h1>

        {query.error ? <div className="alert error">{query.error}</div> : null}

        {state.status === "valid" ? (
          <>
            <p className="lead">
              Join {state.agencyName} as a {state.roleLabel}.
            </p>
            <div className="invite-summary">
              <span>Email</span>
              <strong>{state.email}</strong>
            </div>
            <form action={acceptCounselorInviteAction} className="form-grid single">
              <input name="token" type="hidden" value={state.token} />
              <button className="button" type="submit">
                Accept invite
              </button>
            </form>
            <p className="muted">
              We will only start the secure password setup after you click Accept invite.
            </p>
          </>
        ) : (
          <>
            <div className={state.status === "accepted" ? "alert info" : "alert error"}>
              {state.message}
            </div>
            {state.status === "accepted" ? (
              <Link className="button secondary" href="/login">
                Go to sign in
              </Link>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
