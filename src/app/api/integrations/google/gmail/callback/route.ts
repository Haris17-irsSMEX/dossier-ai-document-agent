import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/actions/audit";
import { getAuthProfileState } from "@/lib/auth/require-profile";
import {
  buildGoogleSettingsUrl,
  getGoogleUserInfo,
  exchangeGoogleCodeForTokens,
  GOOGLE_GMAIL_OAUTH_STATE_COOKIE
} from "@/lib/integrations/google/gmail-oauth";
import { upsertGmailConnection } from "@/lib/integrations/google/gmail-connection";
import { captureAppError } from "@/lib/monitoring/sentry";
import {
  isGoogleGmailConfigured,
  isTokenEncryptionConfigured
} from "@/lib/server-env";

function buildAuthRedirect(
  path: "/login" | "/onboarding",
  key: "message" | "error",
  value: string
) {
  return buildGoogleSettingsUrl(key, value, path);
}

function redirectToSettings(
  key: "error" | "success",
  value: string
) {
  return NextResponse.redirect(buildGoogleSettingsUrl(key, value));
}

function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set({
    name: GOOGLE_GMAIL_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}

function invalidStateResponse() {
  return clearOAuthStateCookie(
    redirectToSettings(
      "error",
      "Google sign-in could not be verified. Please try connecting Gmail again."
    )
  );
}

export async function GET(request: Request) {
  const authState = await getAuthProfileState();

  if (authState.status === "signed_out") {
    return NextResponse.redirect(
      buildAuthRedirect(
        "/login",
        "message",
        "Please sign in to continue."
      )
    );
  }

  if (authState.status === "needs_onboarding") {
    return NextResponse.redirect(
      buildAuthRedirect(
        "/onboarding",
        "message",
        "Create your agency workspace to continue."
      )
    );
  }

  if (!isGoogleGmailConfigured()) {
    return redirectToSettings(
      "error",
      "Google Gmail integration is not configured."
    );
  }

  if (!isTokenEncryptionConfigured()) {
    return redirectToSettings(
      "error",
      "TOKEN_ENCRYPTION_KEY is required before connecting Gmail."
    );
  }

  const url = new URL(request.url);
  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");
  const deniedDescription = url.searchParams.get("error_description");
  const cookieStore = await cookies();
  const expectedState =
    cookieStore.get(GOOGLE_GMAIL_OAUTH_STATE_COOKIE)?.value || null;

  if (denied) {
    return clearOAuthStateCookie(
      redirectToSettings(
        "error",
        denied === "access_denied"
          ? "Google permission was not granted. No Gmail connection was saved."
          : deniedDescription || "Google permission was not granted."
      )
    );
  }

  if (!expectedState || !returnedState || expectedState !== returnedState) {
    return invalidStateResponse();
  }

  if (!code) {
    return clearOAuthStateCookie(
      redirectToSettings(
        "error",
        "Google did not return an authorization code."
      )
    );
  }

  try {
    const tokenResponse = await exchangeGoogleCodeForTokens(code);
    const identity = await getGoogleUserInfo(tokenResponse.accessToken);
    const connection = await upsertGmailConnection(authState.profile, {
      emailAddress: identity.email,
      googleUserId: identity.googleUserId,
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      scopes: tokenResponse.scopes,
      tokenExpiresAt: tokenResponse.tokenExpiresAt
    });

    await createAuditLog({
      agencyId: authState.profile.agency_id,
      actorProfileId: authState.profile.id,
      tableName: "email_connections",
      recordId: connection.id,
      action: "email_connection_connected",
      newData: {
        provider: "google",
        email_address: connection.email_address,
        status: connection.status
      },
      metadata: {
        scopes: connection.scopes,
        google_user_id: connection.google_user_id
      }
    });

    revalidatePath("/settings");
    return clearOAuthStateCookie(
      redirectToSettings(
        "success",
        `Gmail connected as ${connection.email_address}.`
      )
    );
  } catch (error) {
    captureAppError(error, {
      module: "gmail_oauth",
      action: "gmail_connect_callback",
      provider: "google",
      agencyId: authState.profile.agency_id
    });

    return clearOAuthStateCookie(
      redirectToSettings(
        "error",
        error instanceof Error
          ? error.message
          : "Gmail could not be connected."
      )
    );
  }
}
