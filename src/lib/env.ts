import { z } from "zod";

const requiredString = z
  .string()
  .trim()
  .min(1, "Required environment variable is missing.");

const optionalUrl = z
  .string()
  .trim()
  .url("Environment variable must be a valid URL.")
  .optional()
  .or(z.literal(""))
  .transform((value) => value || undefined);

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requiredString.url(
    "NEXT_PUBLIC_SUPABASE_URL must be a valid URL."
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredString,
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_MOBILE_APP_URL: optionalUrl,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let publicEnvCache: PublicEnv | null = null;

function formatEnvError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const key = issue.path.join(".") || "environment";
      return `${key}: ${issue.message}`;
    })
    .join("; ");
}

export function getPublicEnv() {
  if (publicEnvCache) {
    return publicEnvCache;
  }

  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_MOBILE_APP_URL: process.env.NEXT_PUBLIC_MOBILE_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN
  });

  if (!result.success) {
    throw new Error(
      `Core Supabase/public configuration is invalid. ${formatEnvError(result.error)}`
    );
  }

  publicEnvCache = result.data;
  return publicEnvCache;
}

export function getPublicAppUrl() {
  const env = getPublicEnv();

  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  throw new Error(
    "NEXT_PUBLIC_APP_URL is required to generate public links outside development."
  );
}

export function getPublicMobileAppUrl() {
  const env = getPublicEnv();
  return (
    env.NEXT_PUBLIC_MOBILE_APP_URL?.replace(/\/+$/, "") || getPublicAppUrl()
  );
}

export function getPublicSentryDsn() {
  return getPublicEnv().NEXT_PUBLIC_SENTRY_DSN;
}
