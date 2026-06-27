import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import {
  buildFollowUpEmail,
  emailMessageTypes
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";
import { triggerJobNames } from "@/lib/jobs/trigger";
import { captureAppError } from "@/lib/monitoring/sentry";
import { getResendEnv } from "@/lib/server-env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  agencyId: z.string().uuid(),
  studentId: z.string().uuid(),
  messageType: z.enum(emailMessageTypes),
  uploadLink: z.string().url().optional()
});

export const emailFollowUpSendTask = task({
  id: triggerJobNames.emailFollowUpSend,
  run: async (payload: unknown) => {
    const input = payloadSchema.parse(payload);
    const admin = createSupabaseAdminClient();

    try {
      const { data: recent } = await admin
        .from("email_messages")
        .select("id")
        .eq("agency_id", input.agencyId)
        .eq("student_id", input.studentId)
        .eq("message_type", input.messageType)
        .eq("status", "sent")
        .gte("created_at", new Date(Date.now() - 30_000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recent) {
        return { ok: true, skipped: true, reason: "cooldown" };
      }

      const [{ data: student, error }, { data: agency }, { data: items }] =
        await Promise.all([
          admin
            .from("students")
            .select("full_name, email")
            .eq("agency_id", input.agencyId)
            .eq("id", input.studentId)
            .single(),
          admin.from("agencies").select("name").eq("id", input.agencyId).single(),
          admin
            .from("checklist_items")
            .select("document_name, status")
            .eq("agency_id", input.agencyId)
            .eq("student_id", input.studentId)
        ]);

      if (error || !student?.email) {
        throw new Error(error?.message || "Student email address is missing.");
      }

      const email = buildFollowUpEmail({
        messageType: input.messageType,
        agencyName: agency?.name,
        studentName: student.full_name,
        missingDocuments: (items ?? [])
          .filter((item) => item.status === "missing")
          .map((item) => item.document_name),
        problemDocuments: (items ?? [])
          .filter((item) => item.status === "needs_review")
          .map((item) => item.document_name),
        uploadUrl: input.uploadLink
      });
      const result = await sendEmail({
        to: student.email,
        subject: email.subject,
        text: email.text,
        html: email.html
      });
      const { data: saved, error: saveError } = await admin
        .from("email_messages")
        .insert({
          agency_id: input.agencyId,
          student_id: input.studentId,
          to_email: student.email,
          from_email: getResendEnv().RESEND_FROM_EMAIL,
          subject: email.subject,
          body: email.text,
          message_type: input.messageType,
          status: "sent",
          provider: "resend",
          provider_message_id: result?.id,
          sent_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (saveError) {
        throw new Error(saveError.message);
      }

      await createAuditLog({
        agencyId: input.agencyId,
        tableName: "email_messages",
        recordId: saved?.id,
        action: "email_sent",
        metadata: { source: "trigger.dev", message_type: input.messageType }
      });

      return { ok: true, messageId: result?.id };
    } catch (error) {
      captureAppError(error, {
        module: "jobs",
        action: triggerJobNames.emailFollowUpSend,
        provider: "resend",
        agencyId: input.agencyId,
        studentId: input.studentId
      });
      await createAuditLog({
        agencyId: input.agencyId,
        tableName: "email_messages",
        recordId: input.studentId,
        action: "email_failed",
        metadata: { source: "trigger.dev", message_type: input.messageType }
      });
      throw error;
    }
  }
});
