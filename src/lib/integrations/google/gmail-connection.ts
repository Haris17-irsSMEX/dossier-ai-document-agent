import "server-only";

import { requireProfileOrRedirect } from "@/lib/auth/require-profile";
import { getConfiguredWhatsAppProvider } from "@/lib/server-env";
import {
  decryptSecret,
  encryptSecret
} from "@/lib/security/token-encryption";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailConnection, EmailProvider } from "@/lib/types";

type ProfileRef = {
  id: string;
  agency_id: string;
  full_name: string;
  email?: string | null;
  role?: string;
};

async function getLatestGmailConnectionForProfile(profile: ProfileRef) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_connections")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .eq("profile_id", profile.id)
    .eq("provider", "google")
    .order("connected_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as EmailConnection | null;
}

async function getGmailConnectionById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_connections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as EmailConnection | null;
}

async function syncCommunicationEmailProvider(
  profile: ProfileRef,
  emailProvider: EmailProvider
) {
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("communication_settings")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const payload = {
    agency_id: profile.agency_id,
    profile_id: profile.id,
    whatsapp_provider: getConfiguredWhatsAppProvider(),
    consultant_whatsapp_display_name: profile.full_name,
    email_provider: emailProvider,
    default_followup_channel: "whatsapp"
  };

  const query = existing
    ? supabase
        .from("communication_settings")
        .update(payload)
        .eq("id", existing.id)
    : supabase.from("communication_settings").insert(payload);

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }
}

export async function getConnectedGmailConnectionForCurrentUser() {
  const profile = await requireProfileOrRedirect();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_connections")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .eq("profile_id", profile.id)
    .eq("provider", "google")
    .eq("status", "connected")
    .is("revoked_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as EmailConnection | null;
}

export async function getLatestGmailConnectionForCurrentUser() {
  const profile = await requireProfileOrRedirect();
  return getLatestGmailConnectionForProfile(profile);
}

export async function upsertGmailConnection(
  profile: ProfileRef,
  input: {
    emailAddress: string;
    googleUserId: string;
    accessToken: string;
    refreshToken?: string | null;
    scopes: string[];
    tokenExpiresAt?: string | null;
  }
) {
  const supabase = await createSupabaseServerClient();
  const existing = await getLatestGmailConnectionForProfile(profile);
  const refreshTokenEncrypted = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : existing?.refresh_token_encrypted ?? null;

  if (!refreshTokenEncrypted) {
    throw new Error(
      "Google did not return a refresh token. Reconnect Gmail and approve consent again."
    );
  }

  const payload = {
    agency_id: profile.agency_id,
    profile_id: profile.id,
    provider: "google" as const,
    email_address: input.emailAddress,
    google_user_id: input.googleUserId,
    access_token_encrypted: encryptSecret(input.accessToken),
    refresh_token_encrypted: refreshTokenEncrypted,
    token_expires_at: input.tokenExpiresAt ?? null,
    scopes: input.scopes,
    status: "connected" as const,
    connected_at: new Date().toISOString(),
    revoked_at: null
  };

  const query = existing
    ? supabase
        .from("email_connections")
        .update(payload)
        .eq("id", existing.id)
    : supabase.from("email_connections").insert(payload);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  await syncCommunicationEmailProvider(profile, "google");
  return data as EmailConnection;
}

export async function disconnectGmailConnection(profile: ProfileRef) {
  const supabase = await createSupabaseServerClient();
  const existing = await getLatestGmailConnectionForProfile(profile);

  if (!existing) {
    await syncCommunicationEmailProvider(profile, "none");
    return null;
  }

  const { data, error } = await supabase
    .from("email_connections")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null
    })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await syncCommunicationEmailProvider(profile, "none");
  return data as EmailConnection;
}

export async function getGmailAccessToken(connection: EmailConnection) {
  if (!connection.access_token_encrypted) {
    throw new Error("Gmail connection is missing an access token.");
  }

  return decryptSecret(connection.access_token_encrypted);
}

export async function getGmailRefreshToken(connection: EmailConnection) {
  if (!connection.refresh_token_encrypted) {
    throw new Error("Gmail connection is missing a refresh token.");
  }

  return decryptSecret(connection.refresh_token_encrypted);
}

export async function updateGmailConnectionTokens(
  connectionId: string,
  input: {
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
    scopes?: string[] | null;
    lastUsedAt?: string | null;
    status?: EmailConnection["status"];
  }
) {
  const supabase = await createSupabaseServerClient();
  const existing = await getGmailConnectionById(connectionId);

  if (!existing) {
    throw new Error("Gmail connection was not found.");
  }

  const refreshTokenEncrypted = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : existing.refresh_token_encrypted;

  const { data, error } = await supabase
    .from("email_connections")
    .update({
      access_token_encrypted: encryptSecret(input.accessToken),
      refresh_token_encrypted: refreshTokenEncrypted,
      token_expires_at: input.tokenExpiresAt ?? existing.token_expires_at,
      scopes: input.scopes ?? existing.scopes,
      last_used_at: input.lastUsedAt ?? existing.last_used_at,
      status: input.status ?? "connected",
      revoked_at: null
    })
    .eq("id", connectionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as EmailConnection;
}

export async function touchGmailConnectionLastUsed(connectionId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("email_connections")
    .update({
      last_used_at: new Date().toISOString()
    })
    .eq("id", connectionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markGmailConnectionExpired(connectionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_connections")
    .update({
      status: "expired",
      access_token_encrypted: null
    })
    .eq("id", connectionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as EmailConnection;
}
