import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { scanUploadedDocumentFromUploadToken } from "@/lib/actions/document-scans";
import { triggerJobNames } from "@/lib/jobs/trigger";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  agencyId: z.string().uuid(),
  documentId: z.string().uuid(),
  force: z.boolean().optional().default(false)
});

export const aiDocumentCheckTask = task({
  id: triggerJobNames.aiDocumentCheck,
  run: async (payload: unknown) => {
    const input = payloadSchema.parse(payload);

    try {
      const admin = createSupabaseAdminClient();
      const { data: latestExtraction } = await admin
        .from("document_extractions")
        .select("id, extracted_fields")
        .eq("agency_id", input.agencyId)
        .eq("document_id", input.documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        !input.force &&
        latestExtraction?.extracted_fields &&
        typeof latestExtraction.extracted_fields === "object" &&
        "ai_validation" in latestExtraction.extracted_fields
      ) {
        return { ok: true, skipped: true, reason: "already_checked" };
      }

      return await scanUploadedDocumentFromUploadToken({
        agencyId: input.agencyId,
        documentId: input.documentId
      });
    } catch (error) {
      captureAppError(error, {
        module: "jobs",
        action: triggerJobNames.aiDocumentCheck,
        provider: "trigger.dev",
        agencyId: input.agencyId,
        documentId: input.documentId
      });
      throw error;
    }
  }
});
