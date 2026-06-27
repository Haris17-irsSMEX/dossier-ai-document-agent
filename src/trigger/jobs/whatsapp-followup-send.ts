import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { triggerJobNames } from "@/lib/jobs/trigger";
import { sendWhatsAppMessage } from "@/lib/messaging/provider";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatWhatsAppAddress } from "@/lib/whatsapp/twilio";

const payloadSchema = z.object({
  agencyId: z.string().uuid(),
  studentId: z.string().uuid(),
  body: z.string().trim().min(1).max(1600),
  messageType: z.enum([
    "upload_link",
    "missing_documents",
    "reupload_required",
    "verification_required",
    "file_complete"
  ])
});

export const whatsappFollowUpSendTask = task({
  id: triggerJobNames.whatsappFollowUpSend,
  run: async (payload: unknown) => {
    const input = payloadSchema.parse(payload);
    const admin = createSupabaseAdminClient();

    try {
      const { data: recent } = await admin
        .from("whatsapp_messages")
        .select("id")
        .eq("agency_id", input.agencyId)
        .eq("student_id", input.studentId)
        .eq("message_type", input.messageType)
        .in("status", ["queued", "sent"])
        .gte("created_at", new Date(Date.now() - 30_000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recent) {
        return { ok: true, skipped: true, reason: "cooldown" };
      }

      const { data: student, error } = await admin
        .from("students")
        .select("phone")
        .eq("agency_id", input.agencyId)
        .eq("id", input.studentId)
        .single();

      if (error || !student?.phone) {
        throw new Error(error?.message || "Student phone number is missing.");
      }

      const to = formatWhatsAppAddress(student.phone);
      const result = await sendWhatsAppMessage({
        to,
        body: input.body,
        studentId: input.studentId,
        messageType: input.messageType
      });
      const { data: saved, error: saveError } = await admin
        .from("whatsapp_messages")
        .insert({
          agency_id: input.agencyId,
          student_id: input.studentId,
          to_phone: result.to,
          from_phone: result.from,
          body: input.body,
          provider: "twilio",
          provider_message_id: result.messageId,
          status: result.status === "queued" ? "queued" : "sent",
          message_type: input.messageType,
          sent_at: result.sentAt
        })
        .select("id")
        .single();

      if (saveError) {
        throw new Error(saveError.message);
      }

      await createAuditLog({
        agencyId: input.agencyId,
        tableName: "whatsapp_messages",
        recordId: saved?.id,
        action: "whatsapp_sent",
        metadata: { source: "trigger.dev", message_type: input.messageType }
      });

      return { ok: true, messageId: result.messageId };
    } catch (error) {
      captureAppError(error, {
        module: "jobs",
        action: triggerJobNames.whatsappFollowUpSend,
        provider: "twilio",
        agencyId: input.agencyId,
        studentId: input.studentId
      });
      await createAuditLog({
        agencyId: input.agencyId,
        tableName: "whatsapp_messages",
        recordId: input.studentId,
        action: "whatsapp_failed",
        metadata: { source: "trigger.dev", message_type: input.messageType }
      });
      throw error;
    }
  }
});
