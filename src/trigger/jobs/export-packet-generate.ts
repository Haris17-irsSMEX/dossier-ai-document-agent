import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import {
  createApplicationPacket,
  defaultExportPacketOptions
} from "@/lib/export/create-packet";
import { triggerJobNames } from "@/lib/jobs/trigger";
import { captureAppError } from "@/lib/monitoring/sentry";

const payloadSchema = z.object({
  agencyId: z.string().uuid(),
  studentId: z.string().uuid(),
  createdBy: z.string().uuid(),
  options: z
    .object({
      includeAcceptedOnly: z.boolean(),
      includeUploadedAndNeedsReview: z.boolean(),
      excludeRejected: z.boolean(),
      includeVerificationReport: z.boolean(),
      includeScanIssueReport: z.boolean(),
      includeProfileSummaryPdf: z.boolean()
    })
    .optional()
});

export const exportPacketGenerateTask = task({
  id: triggerJobNames.exportPacketGenerate,
  run: async (payload: unknown) => {
    const input = payloadSchema.parse(payload);

    try {
      return await createApplicationPacket({
        agencyId: input.agencyId,
        studentId: input.studentId,
        createdBy: input.createdBy,
        options: input.options || defaultExportPacketOptions
      });
    } catch (error) {
      captureAppError(error, {
        module: "jobs",
        action: triggerJobNames.exportPacketGenerate,
        provider: "trigger.dev",
        agencyId: input.agencyId,
        studentId: input.studentId
      });
      throw error;
    }
  }
});
