"use client";

import { useEffect, useState } from "react";

import { BrandLockup } from "@/components/layout/brand-lockup";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/set-password";
  }

  return value;
}

function buildErrorPath(message: string) {
  return `/set-password?error=${encodeURIComponent(message)}`;
}

function normalizeAuthError(message: string | null) {
  const value = message?.trim();

  if (!value) {
    return "Invite session expired. Ask your senior counselor to regenerate the invite link.";
  }

  const lower = value.toLowerCase();

  if (
    lower.includes("otp_expired") ||
    lower.includes("expired") ||
    lower.includes("invalid")
  ) {
    return "Invite link expired. Ask your senior counselor to generate a new invite link.";
  }

  return value;
}

function readHashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function completeAuth() {
      const supabase = createSupabaseBrowserClient();
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get("next"));
      const hashParams = readHashParams();
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const errorDescription =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error") ||
        hashParams.get("error_description") ||
        hashParams.get("error");

      if (errorDescription) {
        window.location.replace(buildErrorPath(normalizeAuthError(errorDescription)));
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          window.location.replace(
            buildErrorPath(
              "Invite session expired. Ask your senior counselor to regenerate the invite link."
            )
          );
          return;
        }

        window.location.replace(next);
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (sessionError) {
          window.location.replace(
            buildErrorPath(
              "Invite session expired. Ask your senior counselor to regenerate the invite link."
            )
          );
          return;
        }

        window.location.replace(next);
        return;
      }

      if (tokenHash) {
        const otpType = url.searchParams.get("type");
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type:
            otpType === "recovery" || otpType === "signup" || otpType === "invite"
              ? otpType
              : "invite"
        });

        if (verifyError) {
          window.location.replace(
            buildErrorPath(
              "Invite link expired. Ask your senior counselor to generate a new invite link."
            )
          );
          return;
        }

        window.location.replace(next);
        return;
      }

      if (active) {
        setError(
          "Invite session expired. Ask your senior counselor to regenerate the invite link."
        );
      }
    }

    completeAuth().catch(() => {
      if (active) {
        setError(
          "Invite session expired. Ask your senior counselor to regenerate the invite link."
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell auth-page">
      <section className="panel auth-card">
        <BrandLockup />
        <h1>Completing your invite</h1>
        <p className="lead">We are securely connecting your invite session.</p>
        {error ? <div className="alert error">{error}</div> : <div className="alert info">Redirecting to password setup…</div>}
      </section>
    </main>
  );
}
