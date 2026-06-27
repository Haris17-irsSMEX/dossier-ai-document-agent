import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminEnv } from "@/lib/server-env";

let adminClient: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  const env = getSupabaseAdminEnv();

  if (!adminClient) {
    adminClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return adminClient;
}
