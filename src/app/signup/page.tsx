import Link from "next/link";

import { signupAction } from "@/lib/actions/auth";
import { redirectIfAuthenticated } from "@/lib/auth/require-profile";
import { BrandLockup } from "@/components/layout/brand-lockup";

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await redirectIfAuthenticated();
  const params = await searchParams;

  return (
    <main className="app-shell auth-page">
      <section className="panel auth-card">
        <BrandLockup />
        <h1>Create account</h1>
        <p className="lead">Create your user account, then set up your agency workspace.</p>
        {params.error ? <div className="alert error">{params.error}</div> : null}
        <form action={signupAction} className="form-grid single">
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <button className="button" type="submit">
            Create account
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link className="text-link" href="/login">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
