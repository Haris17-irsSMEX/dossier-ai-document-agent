"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { requireCurrentProfile } from "@/lib/actions/students";
import { getConnectedGmailConnectionForCurrentUser } from "@/lib/integrations/google/gmail-connection";
import { sendEmailWithConnectedGmail } from "@/lib/integrations/google/gmail-send";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MessageType } from "@/lib/types";
import {
  isActiveChecklistRequest,
  needsChecklistReview
} from "@/lib/checklists/request-logic";
import { formatDate } from "@/lib/date";

const followUpMessageTypeSchema = z.enum([
  "upload_link",
  "missing_documents",
  "reupload_required",
  "verification_required",
  "file_complete"
]);

const generateEmailDraftSchema = z.object({
  studentId: z.string().uuid(),
  messageType: followUpMessageTypeSchema,
  uploadLink: z.string().url().optional().or(z.literal(""))
});

const sendEmailSchema = z.object({
  studentId: z.string().uuid(),
  messageType: followUpMessageTypeSchema,
  subject: z.string().trim().min(1, "Email subject is required."),
  body: z.string().trim().min(1, "Email body is required.")
});

const EMAIL_UPLOAD_URL_PATTERN = /https?:\/\/[^\s]+\/upload\/[A-Za-z0-9_-]+/i;
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type ChecklistItemRow = {
  id: string;
  document_name: string;
  status: string;
  requirement_level?: string | null;
  is_required?: boolean | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  is_archived?: boolean | null;
};

type VerificationRequestRow = {
  id: string;
  status: string;
  instructions?: string | null;
  portal_reference?: string | null;
  provider?: { name?: string | null } | null;
};

function activeChecklistItems(items: ChecklistItemRow[]) {
  return items.filter(isActiveChecklistRequest);
}

function getEmailIssueBuckets(items: ChecklistItemRow[]) {
  const active = activeChecklistItems(items);

  return {
    missing: active.filter((item) => item.status === "missing"),
    problem: active.filter(
      (item) => item.status !== "missing" && needsChecklistReview(item)
    )
  };
}

function buildDocumentLines(items: ChecklistItemRow[]) {
  return items.map((item, index) => `${index + 1}. ${item.document_name}`);
}

function formatNumberedBlock(lines: string[]) {
  return lines.length ? lines.join("\n") : "";
}

function formatSignatureBlock(signature?: string | null) {
  return signature?.trim() || "";
}

function getVerificationRequestDisplayName(request: VerificationRequestRow) {
  return (
    request.instructions?.trim() ||
    request.portal_reference?.trim() ||
    request.provider?.name?.trim() ||
    "Verification update"
  );
}

function buildFollowUpEmailDraft(input: {
  messageType: MessageType;
  studentName: string;
  consultantName?: string | null;
  agencyName?: string | null;
  uploadLink?: string | null;
  deadline?: string | null;
  signature?: string | null;
  missingItems: ChecklistItemRow[];
  problemItems: ChecklistItemRow[];
  verificationRequests: VerificationRequestRow[];
}) {
  const greeting = `Hi ${input.studentName},`;
  const intro = "I hope you are well.";
  const consultantLine = input.agencyName
    ? [input.consultantName || "Your consultant", input.agencyName]
    : [input.consultantName || "Your consultant"];
  const deadlineLine = input.deadline
    ? `Please complete this before ${formatDate(input.deadline) || input.deadline}.`
    : "";
  const uploadLine = input.uploadLink
    ? `Upload link:\n${input.uploadLink}`
    : "";
  const signature = formatSignatureBlock(input.signature);
  const closingLines = ["Regards,", ...consultantLine, signature].filter(Boolean);
  const footer =
    "You are receiving this because your education consultant is collecting documents for your application.";
  const missingLines = buildDocumentLines(input.missingItems);
  const problemLines = buildDocumentLines(input.problemItems);
  const verificationLines = input.verificationRequests
    .filter((request) =>
      ["required", "pending", "failed", "suspicious", "manual_review", "api_not_connected"].includes(
        request.status
      )
    )
    .map((request, index) => `${index + 1}. ${getVerificationRequestDisplayName(request)}`);

  if (input.messageType === "file_complete") {
    const body = [
      greeting,
      intro,
      "Your requested application documents currently look complete from our side.",
      deadlineLine,
      ...closingLines,
      footer
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      subject: "Your application file is currently complete",
      body
    };
  }

  if (input.messageType === "reupload_required") {
    const body = [
      greeting,
      intro,
      problemLines.length
        ? "Please reupload or correct the following documents for your application:"
        : "A few uploaded documents still need attention for your application.",
      formatNumberedBlock(problemLines),
      uploadLine,
      deadlineLine,
      ...closingLines,
      footer
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      subject: "Document reupload request for your application",
      body
    };
  }

  if (input.messageType === "verification_required") {
    const body = [
      greeting,
      intro,
      verificationLines.length
        ? "Please review these pending verification items for your application:"
        : "Your application still needs a verification update.",
      formatNumberedBlock(verificationLines),
      uploadLine,
      deadlineLine,
      ...closingLines,
      footer
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      subject: "Document verification update for your application",
      body
    };
  }

  const body = [
    greeting,
    intro,
    "Your education consultant is collecting documents for your application.",
    missingLines.length
      ? "Please upload the following requested documents:"
      : "Please upload the remaining requested documents for your application.",
    formatNumberedBlock(missingLines),
    uploadLine,
    deadlineLine,
    ...closingLines,
    footer
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: "Document upload request for your application",
    body
  };
}

async function getEmailFollowUpContext(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const [
    { data: student, error: studentError },
    { data: agency, error: agencyError },
    { data: items, error: itemsError },
    { data: requests, error: requestsError }
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, email, deadline_date")
      .eq("agency_id", profile.agency_id)
      .eq("id", studentId)
      .single(),
    supabase
      .from("agencies")
      .select("name")
      .eq("id", profile.agency_id)
      .single(),
    supabase
      .from("checklist_items")
      .select(
        "id, document_name, status, requirement_level, is_required, is_requested, counts_toward_completion, is_archived"
      )
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId),
    supabase
      .from("verification_requests")
      .select("id, status, instructions, portal_reference, provider:verification_providers(name)")
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
  ]);

  if (studentError || !student) {
    throw new Error(studentError?.message || "Student was not found.");
  }

  if (agencyError) {
    throw new Error(agencyError.message);
  }

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if (requestsError) {
    throw new Error(requestsError.message);
  }

  const gmailConnection = await getConnectedGmailConnectionForCurrentUser();
  const { data: settings } = await supabase
    .from("communication_settings")
    .select("consultant_whatsapp_display_name, message_signature")
    .eq("agency_id", profile.agency_id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  return {
    profile,
    student,
    agency: agency ?? null,
    checklistItems: (items ?? []) as ChecklistItemRow[],
    verificationRequests: (requests ?? []) as VerificationRequestRow[],
    gmailConnection,
    consultantName:
      (settings?.consultant_whatsapp_display_name as string | null) ||
      profile.full_name,
    signature: (settings?.message_signature as string | null) || null
  };
}

function getSafeEmailSendErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Email could not be sent. Please try again.";
  }

  const message = error.message || "";

  if (
    message.includes("Connect Gmail first") ||
    message.includes("connected Gmail") ||
    message.includes("access token") ||
    message.includes("refresh token")
  ) {
    return "Connect Gmail first.";
  }

  if (
    message.includes("expired") ||
    message.includes("reconnect Gmail") ||
    message.includes("refresh token")
  ) {
    return "Gmail connection expired. Please reconnect Gmail.";
  }

  if (
    message.includes("Recipient email") ||
    message.includes("student email")
  ) {
    return "Add student email first.";
  }

  if (message.includes("subject")) {
    return "Email subject is required.";
  }

  if (message.includes("body")) {
    return "Email body is required.";
  }

  if (
    message.includes("Gmail API") ||
    message.includes("gmail.googleapis.com") ||
    message.includes("recipient address") ||
    message.includes("invalid argument") ||
    message.includes("Precondition check failed")
  ) {
    return "Gmail API rejected the message.";
  }

  return "Email could not be sent. Please try again.";
}

export async function generateFollowUpEmailDraftAction(input: {
  studentId: string;
  messageType: MessageType;
  uploadLink?: string;
}) {
  const parsed = generateEmailDraftSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        parsed.error.issues[0]?.message || "Invalid email draft request."
    };
  }

  try {
    const context = await getEmailFollowUpContext(parsed.data.studentId);
    const buckets = getEmailIssueBuckets(context.checklistItems);
    const draft = buildFollowUpEmailDraft({
      messageType: parsed.data.messageType,
      studentName: context.student.full_name,
      consultantName: context.consultantName,
      agencyName: context.agency?.name || null,
      uploadLink: parsed.data.uploadLink || null,
      deadline: context.student.deadline_date || null,
      signature: context.signature,
      missingItems: buckets.missing,
      problemItems: buckets.problem,
      verificationRequests: context.verificationRequests
    });

    return {
      ok: true as const,
      subject: draft.subject,
      body: draft.body
    };
  } catch (error) {
    captureAppError(error, {
      module: "email",
      action: "email_follow_up_generate",
      studentId: input.studentId
    });

    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Email draft could not be generated."
    };
  }
}

export async function sendFollowUpEmailAction(input: {
  studentId: string;
  messageType: MessageType;
  subject: string;
  body: string;
}) {
  const parsed = sendEmailSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message || "Invalid email request."
    };
  }

  try {
    const context = await getEmailFollowUpContext(parsed.data.studentId);

    if (!context.student.email?.trim()) {
      return {
        ok: false as const,
        error: "Add student email first."
      };
    }

    if (!EMAIL_ADDRESS_PATTERN.test(context.student.email.trim())) {
      return {
        ok: false as const,
        error: "Add a valid student email first."
      };
    }

    if (!context.gmailConnection) {
      return {
        ok: false as const,
        error: "Connect Gmail first."
      };
    }

    if (
      !context.gmailConnection.access_token_encrypted ||
      !context.gmailConnection.refresh_token_encrypted
    ) {
      return {
        ok: false as const,
        error: "Gmail connection expired. Please reconnect Gmail."
      };
    }

    if (
      parsed.data.messageType !== "file_complete" &&
      !EMAIL_UPLOAD_URL_PATTERN.test(parsed.data.body)
    ) {
      return {
        ok: false as const,
        error: "Generate or insert the latest upload link before sending this email."
      };
    }

    const supabase = await createSupabaseServerClient();
    const duplicateWindow = new Date(Date.now() - 60_000).toISOString();
    const { data: recentMessage, error: duplicateError } = await supabase
      .from("email_messages")
      .select("id")
      .eq("agency_id", context.profile.agency_id)
      .eq("student_id", context.student.id)
      .eq("to_email", context.student.email)
      .eq("subject", parsed.data.subject)
      .eq("body", parsed.data.body)
      .eq("status", "sent")
      .gte("created_at", duplicateWindow)
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      captureAppError(duplicateError, {
        module: "email",
        action: "email_duplicate_guard",
        provider: "google",
        agencyId: context.profile.agency_id,
        studentId: context.student.id
      });

      return {
        ok: false as const,
        error: "Could not check recent email history. Please try again."
      };
    }

    if (recentMessage) {
      return {
        ok: false as const,
        error: "Duplicate send blocked. Please wait before sending again."
      };
    }

    let providerMessageId: string | null = null;
    let status: "sent" | "failed" = "failed";
    let errorMessage: string | null = null;

    try {
      const result = await sendEmailWithConnectedGmail({
        connection: context.gmailConnection,
        to: context.student.email,
        subject: parsed.data.subject,
        textBody: parsed.data.body
      });
      providerMessageId = result.providerMessageId;
      status = "sent";
    } catch (error) {
      errorMessage = getSafeEmailSendErrorMessage(error);
      captureAppError(error, {
        module: "email",
        action: "gmail_follow_up_send",
        provider: "google",
        agencyId: context.profile.agency_id,
        studentId: context.student.id
      });
    }

    const { data: savedMessage, error: saveError } = await supabase
      .from("email_messages")
      .insert({
        agency_id: context.profile.agency_id,
        student_id: context.student.id,
        email_connection_id: context.gmailConnection.id,
        from_email: context.gmailConnection.email_address,
        to_email: context.student.email,
        subject: parsed.data.subject,
        body: parsed.data.body,
        message_type: parsed.data.messageType,
        status,
        provider: "google",
        provider_message_id: providerMessageId,
        error_message: errorMessage,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        created_by: context.profile.id
      })
      .select("id")
      .single();

    if (saveError) {
      captureAppError(saveError, {
        module: "email",
        action: "email_message_save",
        provider: "google",
        agencyId: context.profile.agency_id,
        studentId: context.student.id
      });

      return {
        ok: false as const,
        error:
          saveError.message.includes("email_messages")
            ? "Could not save email history."
            : "Could not save email history."
      };
    }

    await createAuditLog({
      agencyId: context.profile.agency_id,
      actorProfileId: context.profile.id,
      tableName: "email_messages",
      recordId: savedMessage?.id,
      action: status === "sent" ? "email_sent" : "email_failed",
      metadata: {
        message_type: parsed.data.messageType,
        provider: "google",
        provider_message_id: providerMessageId,
        error_message: errorMessage,
        email_connection_id: context.gmailConnection.id
      }
    });

    revalidatePath(`/students/${context.student.id}/follow-up`);

    return status === "sent"
      ? {
          ok: true as const,
          message: "Email sent.",
          providerMessageId,
          fromEmail: context.gmailConnection.email_address
        }
      : {
          ok: false as const,
          error: errorMessage || "Gmail API rejected the message.",
          providerMessageId,
          fromEmail: context.gmailConnection.email_address
        };
  } catch (error) {
    captureAppError(error, {
      module: "email",
      action: "email_follow_up_send_unhandled",
      provider: "google",
      studentId: parsed.data.studentId
    });

    return {
      ok: false as const,
      error: getSafeEmailSendErrorMessage(error)
    };
  }
}
