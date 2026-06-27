import "server-only";

import { z } from "zod";

const requiredString = z
  .string()
  .trim()
  .min(1, "Required environment variable is missing.");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const deepSeekSchema = z.object({
  AI_PROVIDER: z.literal("deepseek"),
  DEEPSEEK_API_KEY: requiredString,
  DEEPSEEK_BASE_URL: requiredString.url(),
  DEEPSEEK_MODEL: requiredString
});

const azureSchema = z.object({
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: requiredString.url(),
  AZURE_DOCUMENT_INTELLIGENCE_KEY: requiredString
});

const twilioSchema = z.object({
  WHATSAPP_PROVIDER: z.literal("twilio"),
  TWILIO_ACCOUNT_SID: requiredString,
  TWILIO_AUTH_TOKEN: requiredString,
  TWILIO_WHATSAPP_FROM: requiredString
});

const resendSchema = z.object({
  RESEND_API_KEY: requiredString,
  RESEND_FROM_EMAIL: requiredString.email()
});

const triggerSchema = z.object({
  TRIGGER_SECRET_KEY: requiredString
});

const supabaseAdminSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requiredString.url(),
  SUPABASE_SERVICE_ROLE_KEY: requiredString
});

const sentrySchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: optionalString,
  SENTRY_AUTH_TOKEN: optionalString,
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString
});

type Schema = z.ZodType;
const cache = new Map<string, unknown>();

function read(keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function formatError(service: string, error: z.ZodError) {
  const details = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  return `${service} configuration is invalid. ${details}`;
}

function parse<T extends Schema>(
  cacheKey: string,
  service: string,
  schema: T,
  values: Record<string, string | undefined>
): z.infer<T> {
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached as z.infer<T>;
  }

  const result = schema.safeParse(values);

  if (!result.success) {
    throw new Error(formatError(service, result.error));
  }

  cache.set(cacheKey, result.data);
  return result.data;
}

function hasAll(keys: readonly string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

export function isSupabaseAdminConfigured() {
  return hasAll(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
}

export function isDeepSeekConfigured() {
  return (
    process.env.AI_PROVIDER === "deepseek" &&
    hasAll(["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"])
  );
}

export function isAzureConfigured() {
  return hasAll([
    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    "AZURE_DOCUMENT_INTELLIGENCE_KEY"
  ]);
}

export function isWhatsAppConfigured() {
  return (
    process.env.WHATSAPP_PROVIDER === "twilio" &&
    hasAll([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_FROM"
    ])
  );
}

export function isResendConfigured() {
  return hasAll(["RESEND_API_KEY", "RESEND_FROM_EMAIL"]);
}

export function isTriggerConfigured() {
  return hasAll(["TRIGGER_SECRET_KEY"]);
}

export function isSentryConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

export function getDeepSeekEnv() {
  if (!isDeepSeekConfigured()) {
    throw new Error("DeepSeek is not configured.");
  }

  return parse(
    "deepseek",
    "DeepSeek",
    deepSeekSchema,
    read([
      "AI_PROVIDER",
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_BASE_URL",
      "DEEPSEEK_MODEL"
    ])
  );
}

export function getAzureDocumentIntelligenceEnv() {
  if (!isAzureConfigured()) {
    throw new Error("OCR provider not configured.");
  }

  return parse(
    "azure",
    "Azure Document Intelligence",
    azureSchema,
    read([
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
      "AZURE_DOCUMENT_INTELLIGENCE_KEY"
    ])
  );
}

export function getTwilioEnv() {
  if (!isWhatsAppConfigured()) {
    throw new Error("Twilio WhatsApp is not configured.");
  }

  return parse(
    "twilio",
    "Twilio WhatsApp",
    twilioSchema,
    read([
      "WHATSAPP_PROVIDER",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_FROM"
    ])
  );
}

export function getResendEnv() {
  if (!isResendConfigured()) {
    throw new Error("Email provider not configured.");
  }

  return parse(
    "resend",
    "Resend",
    resendSchema,
    read(["RESEND_API_KEY", "RESEND_FROM_EMAIL"])
  );
}

export function getTriggerEnv() {
  if (!isTriggerConfigured()) {
    throw new Error("Trigger.dev is not configured.");
  }

  return parse(
    "trigger",
    "Trigger.dev",
    triggerSchema,
    read(["TRIGGER_SECRET_KEY"])
  );
}

export function getSupabaseAdminEnv() {
  return parse(
    "supabase-admin",
    "Supabase admin",
    supabaseAdminSchema,
    read(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  );
}

export function getSentryServerEnv() {
  return parse(
    "sentry",
    "Sentry",
    sentrySchema,
    read([
      "NEXT_PUBLIC_SENTRY_DSN",
      "SENTRY_AUTH_TOKEN",
      "SENTRY_ORG",
      "SENTRY_PROJECT"
    ])
  );
}
