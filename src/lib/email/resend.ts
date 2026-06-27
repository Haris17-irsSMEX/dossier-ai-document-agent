import "server-only";

import { Resend } from "resend";

import { getResendEnv } from "@/lib/server-env";
import {
  buildDocumentReminderEmail,
  buildStudentUploadLinkEmail,
  type DocumentReminderEmailInput,
  type StudentUploadLinkEmailInput
} from "@/lib/email/templates";
import { captureAppError } from "@/lib/monitoring/sentry";

let resendClient: Resend | null = null;

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput) {
  const env = getResendEnv();

  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }

  try {
    const result = await resendClient.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  } catch (error) {
    captureAppError(error, {
      module: "email",
      action: "resend.sendEmail",
      provider: "resend",
      extra: { recipientCount: Array.isArray(input.to) ? input.to.length : 1 }
    });
    throw new Error(
      `Resend email send failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function sendStudentUploadLinkEmail(
  to: string,
  input: StudentUploadLinkEmailInput
) {
  const email = buildStudentUploadLinkEmail(input);
  return sendEmail({ to, ...email });
}

export async function sendDocumentReminderEmail(
  to: string,
  input: DocumentReminderEmailInput
) {
  const email = buildDocumentReminderEmail(input);
  return sendEmail({ to, ...email });
}
