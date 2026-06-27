"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { requireCurrentProfile } from "@/lib/actions/students";
import {
  buildFollowUpEmail,
  emailMessageTypes,
  type EmailMessageType
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";
import { captureAppError } from "@/lib/monitoring/sentry";
import {
  getResendEnv,
  isResendConfigured
} from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sendEmailSchema = z.object({
  studentId: z.string().uuid(),
  messageType: z.enum(emailMessageTypes),
  uploadLink: z.string().url().optional().or(z.literal(""))
});

function issueBuckets(items: Array<{ document_name: string; status: string }>) {
  return {
    missing: items
      .filter((item) => item.status === "missing")
      .map((item) => item.document_name),
    problem: items
      .filter((item) =>
        [
          "wrong_format",
          "wrong_document",
          "blurry",
          "expired",
          "name_mismatch",
          "needs_review",
          "suspicious",
          "rejected"
        ].includes(item.status)
      )
      .map((item) => item.document_name)
  };
}

export async function sendFollowUpEmailAction(input: {
  studentId: string;
  messageType: EmailMessageType;
  uploadLink?: string;
}) {
  const parsed = sendEmailSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message || "Invalid email request."
    };
  }

  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();
  const [{ data: student, error: studentError }, { data: agency }, { data: items }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, full_name, email")
        .eq("agency_id", profile.agency_id)
        .eq("id", parsed.data.studentId)
        .single(),
      supabase
        .from("agencies")
        .select("name")
        .eq("id", profile.agency_id)
        .single(),
      supabase
        .from("checklist_items")
        .select("document_name, status")
        .eq("agency_id", profile.agency_id)
        .eq("student_id", parsed.data.studentId)
    ]);

  if (studentError || !student) {
    return { ok: false as const, error: "Student was not found." };
  }

  if (!student.email) {
    return { ok: false as const, error: "Student email address is missing." };
  }

  const { data: recentMessage } = await supabase
    .from("email_messages")
    .select("id")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", student.id)
    .eq("message_type", parsed.data.messageType)
    .eq("status", "sent")
    .gte("created_at", new Date(Date.now() - 30_000).toISOString())
    .limit(1)
    .maybeSingle();

  if (recentMessage) {
    return {
      ok: false as const,
      error: "Please wait 30 seconds before sending this email again."
    };
  }

  const buckets = issueBuckets(items ?? []);
  let subject = "Application document update";
  let body = "";
  let html = "";
  let providerMessageId: string | null = null;
  let status: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;
  let fromEmail = "not-configured";

  try {
    if (!isResendConfigured()) {
      throw new Error("Email provider not configured.");
    }

    fromEmail = getResendEnv().RESEND_FROM_EMAIL;
    const email = buildFollowUpEmail({
      messageType: parsed.data.messageType,
      agencyName: agency?.name,
      studentName: student.full_name,
      missingDocuments: buckets.missing,
      problemDocuments: buckets.problem,
      uploadUrl: parsed.data.uploadLink || undefined,
      consultantLine: `Sent by ${agency?.name || "your consultant"}.`
    });
    subject = email.subject;
    body = email.text;
    html = email.html;
    const result = await sendEmail({
      to: student.email,
      subject,
      text: body,
      html
    });
    providerMessageId = result?.id || null;
    status = "sent";
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Email provider failed.";
    captureAppError(error, {
      module: "email",
      action: "email_follow_up_send",
      provider: "resend",
      agencyId: profile.agency_id,
      studentId: student.id
    });
  }

  const { data: savedMessage, error: saveError } = await supabase
    .from("email_messages")
    .insert({
      agency_id: profile.agency_id,
      student_id: student.id,
      to_email: student.email,
      from_email: fromEmail,
      subject,
      body: body || "Email could not be generated.",
      message_type: parsed.data.messageType,
      status,
      provider: "resend",
      provider_message_id: providerMessageId,
      error_message: errorMessage,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      created_by: profile.id
    })
    .select("id")
    .single();

  if (saveError) {
    captureAppError(saveError, {
      module: "email",
      action: "email_message_save",
      agencyId: profile.agency_id,
      studentId: student.id
    });
    return {
      ok: false as const,
      error:
        saveError.message.includes("email_messages")
          ? "Email history is not ready. Run migration 009."
          : saveError.message
    };
  }

  await createAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "email_messages",
    recordId: savedMessage?.id,
    action: status === "sent" ? "email_sent" : "email_failed",
    metadata: {
      message_type: parsed.data.messageType,
      provider_message_id: providerMessageId,
      error_message: errorMessage
    }
  });

  revalidatePath(`/students/${student.id}/follow-up`);

  return {
    ok: status === "sent",
    status,
    error: errorMessage
  };
}
