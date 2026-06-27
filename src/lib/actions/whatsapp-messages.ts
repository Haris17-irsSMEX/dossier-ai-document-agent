"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import { requireCurrentProfile } from "@/lib/actions/students";
import { generateStudentFollowUpMessage } from "@/lib/ai/follow-up-message";
import { getPublicMobileAppUrl } from "@/lib/env";
import { sendWhatsAppMessage } from "@/lib/messaging/provider";
import { formatWhatsAppAddress } from "@/lib/whatsapp/twilio";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MessageType } from "@/lib/types";

const messageTypeSchema = z.enum([
  "upload_link",
  "missing_documents",
  "reupload_required",
  "verification_required",
  "file_complete"
]);

const generateDraftSchema = z.object({
  studentId: z.string().uuid(),
  messageType: messageTypeSchema,
  uploadLink: z.string().url().optional().or(z.literal(""))
});

const sendMessageSchema = z.object({
  studentId: z.string().uuid(),
  messageType: messageTypeSchema,
  body: z.string().trim().min(1, "Message body is required.")
});

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildUploadUrl(token: string) {
  return `${getPublicMobileAppUrl()}/upload/${encodeURIComponent(token)}`;
}

function normalizeTwilioStatus(
  status?: string | null
): "queued" | "sent" | "delivered" | "failed" {
  if (status === "queued" || status === "sent" || status === "delivered" || status === "failed") {
    return status;
  }

  return "sent";
}

function messageIssueBuckets(checklistItems: Array<{ document_name: string; status: string }>) {
  return {
    missing: checklistItems.filter((item) => item.status === "missing"),
    problem: checklistItems.filter((item) =>
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
    ),
    verificationRequired: checklistItems.filter(
      (item) => item.status === "official_verification_required"
    )
  };
}

async function getFollowUpContext(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const [
    { data: student, error: studentError },
    { data: items, error: itemsError },
    { data: requests, error: requestsError },
    { data: messages, error: messagesError },
    { data: uploadTokens, error: tokensError }
  ] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .eq("id", studentId)
      .single(),
    supabase
      .from("checklist_items")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .order("created_at"),
    supabase
      .from("verification_requests")
      .select("*, provider:verification_providers(name, provider_type)")
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .order("created_at"),
    supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("upload_tokens")
      .select("id, expires_at, status, created_at")
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
  ]);

  if (studentError || !student) {
    throw new Error(studentError?.message || "Student was not found.");
  }

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if (requestsError) {
    throw new Error(requestsError.message);
  }

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  if (tokensError) {
    throw new Error(tokensError.message);
  }

  const { data: emailMessages, error: emailMessagesError } = await supabase
    .from("email_messages")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  const checklistItems = items ?? [];
  const buckets = messageIssueBuckets(checklistItems);

  return {
    profile,
    student,
    checklistItems,
    verificationRequests: requests ?? [],
    messages: messages ?? [],
    emailMessages: emailMessages ?? [],
    emailMessagesAvailable: !emailMessagesError,
    latestUploadToken: uploadTokens?.[0] ?? null,
    buckets
  };
}

export async function getFollowUpPageData(studentId: string) {
  return getFollowUpContext(studentId);
}

export async function createWhatsAppUploadLinkAction(input: { studentId: string }) {
  try {
    const studentId = z.string().uuid().parse(input.studentId);
    const context = await getFollowUpContext(studentId);
    const supabase = await createSupabaseServerClient();
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { error } = await supabase.from("upload_tokens").insert({
      agency_id: context.profile.agency_id,
      student_id: studentId,
      token_hash: tokenHash(token),
      max_uploads: 50,
      expires_at: expiresAt,
      created_by: context.profile.id
    });

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditLog({
      agencyId: context.profile.agency_id,
      actorProfileId: context.profile.id,
      tableName: "upload_tokens",
      recordId: studentId,
      action: "upload_token_created",
      metadata: { source: "whatsapp_follow_up" }
    });

    revalidatePath(`/students/${studentId}/follow-up`);

    return {
      ok: true as const,
      uploadLink: buildUploadUrl(token),
      expiresAt
    };
  } catch (error) {
    captureAppError(error, {
      module: "messaging",
      action: "upload_token_create",
      studentId: input.studentId
    });
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not create upload link."
    };
  }
}

export async function generateFollowUpDraftAction(input: {
  studentId: string;
  messageType: MessageType;
  uploadLink?: string;
}) {
  const parsed = generateDraftSchema.parse(input);
  const context = await getFollowUpContext(parsed.studentId);
  const draft = await generateStudentFollowUpMessage({
    studentName: context.student.full_name,
    studentPhone: context.student.phone,
    targetCountry: context.student.target_country || context.student.destination_country,
    uploadLink: parsed.uploadLink || null,
    messageType: parsed.messageType,
    checklistItems: context.checklistItems,
    verificationRequests: context.verificationRequests
  });

  return draft;
}

export async function sendFollowUpWhatsAppAction(input: {
  studentId: string;
  messageType: MessageType;
  body: string;
}) {
  const parsed = sendMessageSchema.parse(input);
  const context = await getFollowUpContext(parsed.studentId);
  const supabase = await createSupabaseServerClient();
  const messageType = parsed.messageType;
  const since = new Date(Date.now() - 30_000).toISOString();
  const { data: recentMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("agency_id", context.profile.agency_id)
    .eq("student_id", parsed.studentId)
    .eq("message_type", messageType)
    .in("status", ["queued", "sent"])
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (recentMessage) {
    return {
      ok: false as const,
      status: "failed",
      error: "Please wait 30 seconds before sending another message of this type."
    };
  }

  let toPhone = context.student.phone || "";
  let fromPhone = "twilio";
  let providerMessageId: string | null = null;
  let sentAt: string | null = null;
  let status: "sent" | "queued" | "delivered" | "failed" = "failed";
  let errorMessage: string | null = null;

  try {
    if (!toPhone) {
      throw new Error("Student phone number is missing.");
    }

    toPhone = formatWhatsAppAddress(toPhone, "Student WhatsApp number");
    const result = await sendWhatsAppMessage({
      to: toPhone,
      body: parsed.body,
      studentId: parsed.studentId,
      messageType
    });
    fromPhone = result.from;
    providerMessageId = result.messageId;
    sentAt = result.sentAt;
    status = normalizeTwilioStatus(result.status);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Twilio send failed.";
    captureAppError(error, {
      module: "messaging",
      action: "whatsapp_send",
      provider: "twilio",
      agencyId: context.profile.agency_id,
      studentId: parsed.studentId
    });
  }

  const { data: savedMessage, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      agency_id: context.profile.agency_id,
      student_id: parsed.studentId,
      to_phone: toPhone || context.student.phone || "",
      from_phone: fromPhone,
      body: parsed.body,
      provider: "twilio",
      provider_message_id: providerMessageId,
      status,
      error_message: errorMessage,
      message_type: messageType,
      sent_at: sentAt,
      created_by: context.profile.id
    })
    .select("id")
    .single();

  if (error) {
    captureAppError(error, {
      module: "messaging",
      action: "whatsapp_message_save",
      provider: "twilio",
      agencyId: context.profile.agency_id,
      studentId: parsed.studentId
    });
    return {
      ok: false as const,
      status: "failed",
      error: "WhatsApp result could not be saved. Please try again."
    };
  }

  await writeAuditLog({
    agencyId: context.profile.agency_id,
    actorProfileId: context.profile.id,
    tableName: "whatsapp_messages",
    recordId: savedMessage?.id || parsed.studentId,
    action: status === "failed" ? "whatsapp_failed" : "whatsapp_sent",
    metadata: {
      message_type: messageType,
      provider_message_id: providerMessageId,
      error_message: errorMessage
    }
  });

  revalidatePath(`/students/${parsed.studentId}/follow-up`);

  return {
    ok: status !== "failed",
    status,
    error: errorMessage
  };
}
