"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentProfile } from "@/lib/actions/students";
import {
  createApplicationPacket,
  defaultExportPacketOptions,
  getExportPacketPreview,
  type ExportPacketOptions
} from "@/lib/export/create-packet";
import { captureAppError } from "@/lib/monitoring/sentry";

const exportOptionsSchema = z.object({
  includeAcceptedOnly: z.boolean().default(defaultExportPacketOptions.includeAcceptedOnly),
  includeUploadedAndNeedsReview: z
    .boolean()
    .default(defaultExportPacketOptions.includeUploadedAndNeedsReview),
  excludeRejected: z.boolean().default(defaultExportPacketOptions.excludeRejected),
  includeVerificationReport: z
    .boolean()
    .default(defaultExportPacketOptions.includeVerificationReport),
  includeScanIssueReport: z
    .boolean()
    .default(defaultExportPacketOptions.includeScanIssueReport),
  includeProfileSummaryPdf: z
    .boolean()
    .default(defaultExportPacketOptions.includeProfileSummaryPdf)
});

const exportPacketInputSchema = z.object({
  studentId: z.string().uuid(),
  options: exportOptionsSchema
});

export async function getStudentExportPreview(studentId: string) {
  await requireCurrentProfile();
  return getExportPacketPreview(studentId);
}

export async function generateExportPacketAction(input: {
  studentId: string;
  options: ExportPacketOptions;
}) {
  try {
    const parsed = exportPacketInputSchema.parse(input);
    const profile = await requireCurrentProfile();
    const result = await createApplicationPacket({
      studentId: parsed.studentId,
      agencyId: profile.agency_id,
      createdBy: profile.id,
      options: parsed.options
    });

    revalidatePath(`/students/${parsed.studentId}/export`);
    return {
      ok: true as const,
      ...result
    };
  } catch (error) {
    console.error("[export-packets] generate failed", error);
    captureAppError(error, {
      module: "export",
      action: "export_packet_generate",
      studentId: input.studentId
    });
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not generate the export packet."
    };
  }
}
