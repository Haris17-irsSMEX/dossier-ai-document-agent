import { BrandLockup } from "@/components/layout/brand-lockup";
import { SetPasswordSessionCheck } from "@/components/auth/set-password-session-check";
import { setPasswordAction } from "@/lib/actions/set-password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  let profile:
    | {
        role?: string | null;
        status?: string | null;
      }
    | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  const hasInviteSession = Boolean(user);
  const suspended = profile?.status === "suspended";
  const archived = profile?.status === "archived";

  return (
    <main className="app-shell auth-page">
      <section className="panel auth-card">
        <BrandLockup />
        <h1>Create your Dossier password</h1>
        <p className="lead">Set a password to activate your counselor account.</p>

        {params.message ? <div className="alert info">{params.message}</div> : null}
        {params.error ? <div className="alert error">{params.error}</div> : null}

        {!hasInviteSession ? (
          <SetPasswordSessionCheck />
        ) : suspended ? (
          <div className="alert error">
            This account is suspended. Contact your agency admin.
          </div>
        ) : archived ? (
          <div className="alert error">
            This account is archived. Contact your agency admin.
          </div>
        ) : (
          <form action={setPasswordAction} className="form-grid single">
            <label>
              New password
              <input
                autoComplete="new-password"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </label>
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                minLength={8}
                name="confirm_password"
                required
                type="password"
              />
            </label>
            <button className="button" type="submit">
              Continue
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
