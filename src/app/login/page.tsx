import Link from "next/link";

import { loginAction } from "@/lib/actions/auth";
import { redirectIfAuthenticated } from "@/lib/auth/require-profile";
import { BrandLockup } from "@/components/layout/brand-lockup";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  await redirectIfAuthenticated();
  const params = await searchParams;

  return (
    <main className="app-shell auth-page">
      <section className="panel auth-card">
        <BrandLockup />
        <h1>Sign in</h1>
        <p className="lead">Please sign in to continue.</p>
        {params.message ? <div className="alert info">{params.message}</div> : null}
        {params.error ? <div className="alert error">{params.error}</div> : null}
        <form action={loginAction} className="form-grid single">
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
              autoComplete="current-password"
            />
          </label>
          <button className="button" type="submit">
            Sign in
          </button>
        </form>
        <p className="muted">
          New here? <Link className="text-link" href="/signup">Create an account</Link>.
        </p>
        <p className="muted">
          Invited counselor? Open your invite link first to create your password.
        </p>
      </section>
    </main>
  );
}
