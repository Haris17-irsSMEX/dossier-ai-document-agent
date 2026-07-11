import "server-only";

import crypto from "node:crypto";

import { getPublicAppUrl } from "@/lib/config/app-url";
import { getGoogleGmailEnv } from "@/lib/server-env";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send"
] as const;

export const GOOGLE_GMAIL_OAUTH_STATE_COOKIE =
  "dossier_google_gmail_oauth_state";

export type GoogleTokenExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  idToken: string | null;
};

export type GoogleUserInfo = {
  email: string;
  googleUserId: string;
  name?: string | null;
  picture?: string | null;
};

function parseScopeList(scopeValue?: string | null) {
  return (scopeValue || "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function parseJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Google returned an invalid JSON response.");
  }
}

export function createGoogleOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

function getValidatedGoogleRedirectUri() {
  const { GOOGLE_GMAIL_REDIRECT_URI } = getGoogleGmailEnv();

  try {
    const parsed = new URL(GOOGLE_GMAIL_REDIRECT_URI);

    if (parsed.hostname === "0.0.0.0") {
      throw new Error(
        "Google Gmail redirect URI is not configured correctly. Use http://localhost:3000/api/integrations/google/gmail/callback in local development."
      );
    }

    return GOOGLE_GMAIL_REDIRECT_URI.replace(/\/+$/, "");
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      "Google Gmail redirect URI is not configured correctly. Use http://localhost:3000/api/integrations/google/gmail/callback in local development."
    );
  }
}

export function buildGoogleGmailAuthUrl(state: string) {
  if (!state?.trim()) {
    throw new Error("Google OAuth state is missing.");
  }

  const { GOOGLE_CLIENT_ID } = getGoogleGmailEnv();
  const url = new URL(GOOGLE_AUTH_BASE_URL);

  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", getValidatedGoogleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeGoogleCodeForTokens(code: string) {
  if (!code?.trim()) {
    throw new Error("Google OAuth code is missing.");
  }

  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  } = getGoogleGmailEnv();
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: getValidatedGoogleRedirectUri()
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });
  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const message =
      typeof payload?.error_description === "string"
        ? payload.error_description
        : typeof payload?.error === "string"
          ? payload.error
          : "Google token exchange failed.";
    throw new Error(message);
  }

  const accessToken =
    typeof payload?.access_token === "string" ? payload.access_token : null;

  if (!accessToken) {
    throw new Error("Google did not return an access token.");
  }

  const expiresIn =
    typeof payload?.expires_in === "number" ? payload.expires_in : null;

  return {
    accessToken,
    refreshToken:
      typeof payload?.refresh_token === "string" ? payload.refresh_token : null,
    tokenType: typeof payload?.token_type === "string" ? payload.token_type : null,
    scopes: parseScopeList(
      typeof payload?.scope === "string" ? payload.scope : null
    ),
    tokenExpiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    idToken: typeof payload?.id_token === "string" ? payload.id_token : null
  } satisfies GoogleTokenExchangeResult;
}

export async function getGoogleUserInfo(accessToken: string) {
  if (!accessToken?.trim()) {
    throw new Error("Google access token is missing.");
  }

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const message =
      typeof payload?.error_description === "string"
        ? payload.error_description
        : typeof payload?.error === "string"
          ? payload.error
          : "Google user profile could not be loaded.";
    throw new Error(message);
  }

  const email = typeof payload?.email === "string" ? payload.email : null;
  const googleUserId = typeof payload?.sub === "string" ? payload.sub : null;

  if (!email || !googleUserId) {
    throw new Error("Google did not return the connected email identity.");
  }

  return {
    email,
    googleUserId,
    name: typeof payload?.name === "string" ? payload.name : null,
    picture: typeof payload?.picture === "string" ? payload.picture : null
  } satisfies GoogleUserInfo;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  if (!refreshToken?.trim()) {
    throw new Error("Google refresh token is missing.");
  }

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = getGoogleGmailEnv();
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });
  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const message =
      typeof payload?.error_description === "string"
        ? payload.error_description
        : typeof payload?.error === "string"
          ? payload.error
          : "Google access token refresh failed.";
    throw new Error(message);
  }

  const accessToken =
    typeof payload?.access_token === "string" ? payload.access_token : null;

  if (!accessToken) {
    throw new Error("Google did not return a refreshed access token.");
  }

  const expiresIn =
    typeof payload?.expires_in === "number" ? payload.expires_in : null;

  return {
    accessToken,
    refreshToken:
      typeof payload?.refresh_token === "string" ? payload.refresh_token : null,
    tokenType: typeof payload?.token_type === "string" ? payload.token_type : null,
    scopes: parseScopeList(
      typeof payload?.scope === "string" ? payload.scope : null
    ),
    tokenExpiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    idToken: typeof payload?.id_token === "string" ? payload.id_token : null
  } satisfies GoogleTokenExchangeResult;
}

export function buildGoogleSettingsUrl(
  key: "error" | "success" | "message",
  value: string,
  path = "/settings"
) {
  const url = new URL(`${getPublicAppUrl()}${path}`);
  url.searchParams.set(key, value);
  return url;
}
