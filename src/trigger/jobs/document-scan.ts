import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { scanUploadedDocumentFromUploadToken } from "@/lib/actions/document-scans";
import { triggerJobNames } from "@/lib/jobs/trigger";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  agencyId: z.string().uuid(),
  documentId: z.string().uuid(),
  force: z.boolean().optional().default(false)
});

export const documentScanTask = task({
  id: triggerJobNames.documentScan,
  run: async (payload: unknown) => {
    const input = payloadSchema.parse(payload);

    try {
      const admin = createSupabaseAdminClient();
      const { data: document, error } = await admin
        .from("documents")
        .select("id, student_id, scan_status")
        .eq("agency_id", input.agencyId)
        .eq("id", input.documentId)
        .single();

      if (error || !document) {
        throw new Error(error?.message || "Document not found.");
      }

      if (
        !input.force &&
        ["scanned", "scanning"].includes(document.scan_status)
      ) {
        return { ok: true, skipped: true, reason: document.scan_status };
      }

      const result = await scanUploadedDocumentFromUploadToken({
        agencyId: input.agencyId,
        documentId: input.documentId
      });

      await createAuditLog({
        agencyId: input.agencyId,
        tableName: "documents",
        recordId: input.documentId,
        action: result.ok
          ? "document_scan_completed"
          : "document_scan_failed",
        metadata: { source: "trigger.dev", scan_status: result.scanStatus }
      });

      return result;
    } catch (error) {
      captureAppError(error, {
        module: "jobs",
        action: triggerJobNames.documentScan,
        provider: "trigger.dev",
        agencyId: input.agencyId,
        documentId: input.documentId
      });
      throw error;
    }
  }
});
