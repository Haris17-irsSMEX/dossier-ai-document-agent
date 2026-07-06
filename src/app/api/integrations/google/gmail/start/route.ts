import { NextResponse } from "next/server";

import { getAuthProfileState } from "@/lib/auth/require-profile";
import {
  buildGoogleGmailAuthUrl,
  createGoogleOAuthState,
  GOOGLE_GMAIL_OAUTH_STATE_COOKIE
} from "@/lib/integrations/google/gmail-oauth";
import { captureAppError } from "@/lib/monitoring/sentry";
import {
  isGoogleGmailConfigured,
  isTokenEncryptionConfigured
} from "@/lib/server-env";

function redirectWithMessage(
  request: Request,
  path: string,
  key: "error" | "message",
  message: string
) {
  const url = new URL(path, request.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const state = await getAuthProfileState();

  if (state.status === "signed_out") {
    return redirectWithMessage(
      request,
      "/login",
      "message",
      "Please sign in to continue."
    );
  }

  if (state.status === "needs_onboarding") {
    return redirectWithMessage(
      request,
      "/onboarding",
      "message",
      "Create your agency workspace to continue."
    );
  }

  if (!isGoogleGmailConfigured()) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "Google Gmail integration is not configured."
    );
  }

  if (!isTokenEncryptionConfigured()) {
    return redirectWithMessage(
      request,
      "/settings",
      "error",
      "TOKEN_ENCRYPTION_KEY is required before connecting Gmail."
    );
  }

  try {
    const oauthState = createGoogleOAuthState();
    const response = NextResponse.redirect(buildGoogleGmailAuthUrl(oauthState));

    response.cookies.set({
      name: GOOGLE_GMAIL_OAUTH_STATE_COOKIE,
      value: oauthState,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10
    });

    return response;
  } catch (error) {
    captureAppError(error, {
      module: "gmail_oauth",
      action: "gmail_connect_start",
      agencyId: state.profile.agency_id
    });

    return redirectWithMessage(
      request,
      "/settings",
      "error",
      error instanceof Error
        ? error.message
        : "Gmail OAuth could not be started."
    );
  }
}
