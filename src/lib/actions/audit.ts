import "server-only";

import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type JsonRecord = Record<string, unknown>;

export type AuditLogInput = {
  agencyId: string;
  tableName: string;
  action: string;
  recordId?: string;
  actorProfileId?: string;
  oldData?: JsonRecord | null;
  newData?: JsonRecord | null;
  metadata?: JsonRecord;
};

export async function createAuditLog(input: AuditLogInput) {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      agency_id: input.agencyId,
      actor_profile_id: input.actorProfileId,
      table_name: input.tableName,
      record_id: input.recordId,
      action: input.action,
      old_data: input.oldData,
      new_data: input.newData,
      metadata: input.metadata ?? {}
    });

    if (error) {
      throw new Error(error.message);
    }

    return true;
  } catch (error) {
    console.error("[audit] failed to write audit log", error);
    captureAppError(error, {
      module: "audit",
      action: "audit_log_insert",
      agencyId: input.agencyId,
      extra: {
        tableName: input.tableName,
        recordId: input.recordId,
        auditAction: input.action
      }
    });
    return false;
  }
}

export const writeAuditLog = createAuditLog;
