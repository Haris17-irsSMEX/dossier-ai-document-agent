import "server-only";

import { z } from "zod";

import { requireProfileOrRedirect } from "@/lib/auth/require-profile";
import { getConnectedGmailConnectionForCurrentUser } from "@/lib/integrations/google/gmail-connection";
import { getConfiguredWhatsAppProvider } from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommunicationSettings,
  EmailProvider,
  FollowUpChannel,
  WhatsAppProvider
} from "@/lib/types";
import { emailProviders, whatsappProviders } from "@/lib/types";

const followUpChannels = ["whatsapp", "email"] as const;

const communicationSettingsSchema = z.object({
  whatsapp_provider: z.enum(whatsappProviders).optional(),
  consultant_whatsapp_number: z.string().trim().max(50).optional().nullable(),
  consultant_whatsapp_display_name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable(),
  email_provider: z.enum(emailProviders).optional(),
  default_followup_channel: z.enum(followUpChannels).optional(),
  message_signature: z.string().trim().max(1000).optional().nullable()
});

function emptyToNull(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() ? value.trim() : null;
}

function resolveNullableString(
  nextValue: string | null | undefined,
  currentValue: string | null | undefined
) {
  if (nextValue === undefined) {
    return currentValue ?? null;
  }

  return emptyToNull(nextValue) ?? null;
}

function defaultSettings(profile: {
  id: string;
  agency_id: string;
  full_name: string;
}) {
  const now = new Date(0).toISOString();

  return {
    id: "",
    agency_id: profile.agency_id,
    profile_id: profile.id,
    whatsapp_provider: getConfiguredWhatsAppProvider(),
    consultant_whatsapp_number: null,
    consultant_whatsapp_display_name: profile.full_name,
    email_provider: "none" as EmailProvider,
    default_followup_channel: "whatsapp" as FollowUpChannel,
    message_signature: null,
    created_at: now,
    updated_at: now
  } satisfies CommunicationSettings;
}

export async function getCommunicationSettings() {
  const profile = await requireProfileOrRedirect();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("communication_settings")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CommunicationSettings | null) ?? defaultSettings(profile);
}

export async function upsertCommunicationSettings(
  input: Partial<{
    whatsapp_provider: WhatsAppProvider;
    consultant_whatsapp_number: string | null;
    consultant_whatsapp_display_name: string | null;
    email_provider: EmailProvider;
    default_followup_channel: FollowUpChannel;
    message_signature: string | null;
  }>
) {
  const parsed = communicationSettingsSchema.parse(input);
  const profile = await requireProfileOrRedirect();
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("communication_settings")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const defaults = defaultSettings(profile);
  const current = (existing as CommunicationSettings | null) ?? defaults;
  const payload = {
    agency_id: profile.agency_id,
    profile_id: profile.id,
    whatsapp_provider:
      parsed.whatsapp_provider ?? current.whatsapp_provider,
    consultant_whatsapp_number: resolveNullableString(
      parsed.consultant_whatsapp_number,
      current.consultant_whatsapp_number
    ),
    consultant_whatsapp_display_name: resolveNullableString(
      parsed.consultant_whatsapp_display_name,
      current.consultant_whatsapp_display_name
    ),
    email_provider: parsed.email_provider ?? current.email_provider,
    default_followup_channel:
      parsed.default_followup_channel ?? current.default_followup_channel,
    message_signature: resolveNullableString(
      parsed.message_signature,
      current.message_signature
    )
  };

  const query = existing
    ? supabase
        .from("communication_settings")
        .update(payload)
        .eq("id", existing.id)
    : supabase.from("communication_settings").insert(payload);

  const { data, error } = await query.select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CommunicationSettings;
}

export async function getActiveGmailConnection() {
  return getConnectedGmailConnectionForCurrentUser();
}

export async function getManualWhatsAppSettings() {
  const settings = await getCommunicationSettings();

  return {
    provider: settings.whatsapp_provider,
    isManualHandoff: settings.whatsapp_provider === "manual_handoff",
    consultantWhatsAppNumber: settings.consultant_whatsapp_number,
    consultantWhatsAppDisplayName: settings.consultant_whatsapp_display_name,
    defaultFollowUpChannel: settings.default_followup_channel,
    messageSignature: settings.message_signature
  };
}
