"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import { requireCurrentProfile } from "@/lib/actions/students";
import {
  buildDeterministicFollowUpMessage,
  generateStudentFollowUpMessage
} from "@/lib/ai/follow-up-message";
import {
  buildWhatsAppHandoffUrl,
  normalizeWhatsAppNumber,
  validateWhatsAppNumber
} from "@/lib/communication/whatsapp-handoff";
import { buildAbsoluteAppUrl } from "@/lib/config/app-url";
import {
  isActiveChecklistRequest,
  needsChecklistReview
} from "@/lib/checklists/request-logic";
import { sendWhatsAppMessage } from "@/lib/messaging/provider";
import { captureAppError } from "@/lib/monitoring/sentry";
import {
  getConfiguredWhatsAppProvider
} from "@/lib/server-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  MessageType,
  WhatsAppHandoff,
  WhatsAppProvider
} from "@/lib/types";
import { formatWhatsAppAddress } from "@/lib/whatsapp/twilio";

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

const manualHandoffSchema = z.object({
  studentId: z.string().uuid(),
  messageType: messageTypeSchema,
  body: z.string().trim().min(1, "Message body is required.")
});

const markManualSentSchema = z.object({
  studentId: z.string().uuid(),
  handoffId: z.string().uuid().optional().or(z.literal(""))
});

type ChecklistItemRow = {
  id: string;
  document_name: string;
  status: string;
  instructions?: string | null;
  accepted_formats?: string[] | null;
  requirement_level?: string | null;
  is_required?: boolean | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  is_archived?: boolean | null;
};

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildUploadUrl(token: string) {
  return buildAbsoluteAppUrl(`/upload/${encodeURIComponent(token)}`);
}

function normalizeTwilioStatus(
  status?: string | null
): "queued" | "sent" | "delivered" | "failed" {
  if (
    status === "queued" ||
    status === "sent" ||
    status === "delivered" ||
    status === "failed"
  ) {
    return status;
  }

  return "sent";
}

function manualHandoffFeatureError(message: string) {
  if (
    message.includes("communication_settings") ||
    message.includes("whatsapp_handoffs")
  ) {
    return "Manual WhatsApp handoff is not ready yet. Run Supabase migration 013 first.";
  }

  return message;
}

function messageIssueBuckets(checklistItems: ChecklistItemRow[]) {
  const activeItems = checklistItems.filter(isActiveChecklistRequest);

  return {
    missing: activeItems.filter((item) => item.status === "missing"),
    problem: activeItems.filter(
      (item) => item.status !== "missing" && needsChecklistReview(item)
    ),
    verificationRequired: activeItems.filter(
      (item) => item.status === "official_verification_required"
    )
  };
}

async function loadManualCommunicationData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  profile: Awaited<ReturnType<typeof requireCurrentProfile>>,
  studentId: string
) {
  try {
    const [{ data: settings, error: settingsError }, { data: handoffs, error: handoffsError }] =
      await Promise.all([
        supabase
          .from("communication_settings")
          .select("*")
          .eq("agency_id", profile.agency_id)
          .eq("profile_id", profile.id)
          .maybeSingle(),
        supabase
          .from("whatsapp_handoffs")
          .select("*")
          .eq("agency_id", profile.agency_id)
          .eq("profile_id", profile.id)
          .eq("student_id", studentId)
          .order("opened_at", { ascending: false })
          .limit(10)
      ]);

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    if (handoffsError) {
      throw new Error(handoffsError.message);
    }

    return {
      settings: settings
        ? {
            provider: settings.whatsapp_provider as WhatsAppProvider,
            consultantWhatsAppNumber:
              settings.consultant_whatsapp_number as string | null,
            consultantWhatsAppDisplayName:
              settings.consultant_whatsapp_display_name as string | null,
            defaultFollowUpChannel:
              settings.default_followup_channel as string | null,
            messageSignature: settings.message_signature as string | null
          }
        : {
            provider: "manual_handoff" as WhatsAppProvider,
            consultantWhatsAppNumber: null,
            consultantWhatsAppDisplayName: profile.full_name,
            defaultFollowUpChannel: "whatsapp",
            messageSignature: null
          },
      handoffs: (handoffs ?? []) as WhatsAppHandoff[],
      error: null as string | null
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? manualHandoffFeatureError(error.message)
        : "Manual WhatsApp handoff is not ready yet.";

    captureAppError(error, {
      module: "communication",
      action: "manual_whatsapp_context_load",
      agencyId: profile.agency_id,
      studentId
    });

    return {
      settings: {
        provider: "manual_handoff" as WhatsAppProvider,
        consultantWhatsAppNumber: null,
        consultantWhatsAppDisplayName: profile.full_name,
        defaultFollowUpChannel: "whatsapp",
        messageSignature: null
      },
      handoffs: [] as WhatsAppHandoff[],
      error: message
    };
  }
}

async function getFollowUpContext(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();
  const whatsappProvider = getConfiguredWhatsAppProvider();

  const [
    { data: student, error: studentError },
    { data: items, error: itemsError },
    { data: requests, error: requestsError },
    { data: messages, error: messagesError },
    { data: uploadTokens, error: tokensError },
    { data: agency, error: agencyError },
    { data: emailMessages, error: emailMessagesError }
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
      .limit(1),
    supabase
      .from("agencies")
      .select("id, name")
      .eq("id", profile.agency_id)
      .single(),
    supabase
      .from("email_messages")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
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

  if (agencyError) {
    throw new Error(agencyError.message);
  }

  const manualCommunication = await loadManualCommunicationData(
    supabase,
    profile,
    studentId
  );
  const checklistItems = (items ?? []) as ChecklistItemRow[];
  const buckets = messageIssueBuckets(checklistItems);

  return {
    profile,
    student,
    agency: agency ?? null,
    checklistItems,
    verificationRequests: requests ?? [],
    messages: messages ?? [],
    emailMessages: emailMessages ?? [],
    emailMessagesAvailable: !emailMessagesError,
    latestUploadToken: uploadTokens?.[0] ?? null,
    buckets,
    whatsappProvider,
    communicationSettings: manualCommunication.settings,
    communicationSettingsError: manualCommunication.error,
    manualHandoffs: manualCommunication.handoffs
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
    const revokedAt = new Date().toISOString();

    const { error: revokeError } = await supabase
      .from("upload_tokens")
      .update({
        status: "revoked",
        revoked_at: revokedAt
      })
      .eq("agency_id", context.profile.agency_id)
      .eq("student_id", studentId)
      .eq("status", "active");

    if (revokeError) {
      throw new Error(revokeError.message);
    }

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
      error:
        error instanceof Error ? error.message : "Could not create upload link."
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
  const followUpInput = {
    studentName: context.student.full_name,
    studentPhone: context.student.phone,
    targetCountry:
      context.student.target_country || context.student.destination_country,
    uploadLink: parsed.uploadLink || null,
    messageType: parsed.messageType,
    consultantName:
      context.communicationSettings.consultantWhatsAppDisplayName ||
      context.profile.full_name,
    agencyName: context.agency?.name || null,
    deadline: context.student.deadline_date || null,
    signature: context.communicationSettings.messageSignature || null,
    checklistItems: context.checklistItems,
    verificationRequests: context.verificationRequests
  };

  if (context.whatsappProvider === "manual_handoff") {
    return {
      body: buildDeterministicFollowUpMessage(followUpInput),
      source: "dossier" as const
    };
  }

  return generateStudentFollowUpMessage(followUpInput);
}

export async function openManualWhatsAppHandoffAction(input: {
  studentId: string;
  messageType: MessageType;
  body: string;
}) {
  const parsed = manualHandoffSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        parsed.error.issues[0]?.message ||
        "Manual WhatsApp handoff request is invalid."
    };
  }

  try {
    const context = await getFollowUpContext(parsed.data.studentId);

    if (context.whatsappProvider !== "manual_handoff") {
      return {
        ok: false as const,
        error:
          "Manual WhatsApp handoff is disabled because the active provider is not manual_handoff."
      };
    }

    if (context.communicationSettingsError) {
      return {
        ok: false as const,
        error: context.communicationSettingsError
      };
    }

    if (!context.student.phone?.trim()) {
      return {
        ok: false as const,
        error: "Add a valid student WhatsApp number first."
      };
    }

    const validatedPhone = validateWhatsAppNumber(context.student.phone);

    if (!validatedPhone.ok) {
      return {
        ok: false as const,
        error: validatedPhone.error
      };
    }

    const handoffUrl = buildWhatsAppHandoffUrl(
      validatedPhone.normalized,
      parsed.data.body
    );
    const toNumber = normalizeWhatsAppNumber(validatedPhone.normalized);
    const supabase = await createSupabaseServerClient();
    const { data: handoff, error } = await supabase
      .from("whatsapp_handoffs")
      .insert({
        agency_id: context.profile.agency_id,
        profile_id: context.profile.id,
        student_id: parsed.data.studentId,
        from_display_number:
          context.communicationSettings.consultantWhatsAppNumber,
        to_number: toNumber,
        message_body: parsed.data.body,
        handoff_url: handoffUrl,
        status: "handoff_opened"
      })
      .select("id, status, opened_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await writeAuditLog({
      agencyId: context.profile.agency_id,
      actorProfileId: context.profile.id,
      tableName: "whatsapp_handoffs",
      recordId: handoff.id,
      action: "whatsapp_handoff_opened",
      metadata: {
        student_id: parsed.data.studentId,
        message_type: parsed.data.messageType
      }
    });

    revalidatePath(`/students/${parsed.data.studentId}/follow-up`);

    return {
      ok: true as const,
      handoffId: handoff.id,
      handoffUrl,
      toNumber
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? manualHandoffFeatureError(error.message)
        : "WhatsApp handoff could not be opened.";

    captureAppError(error, {
      module: "communication",
      action: "manual_whatsapp_handoff_open",
      studentId: input.studentId
    });

    return {
      ok: false as const,
      error: message
    };
  }
}

export async function markWhatsAppHandoffSentAction(input: {
  studentId: string;
  handoffId?: string;
}) {
  const parsed = markManualSentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        parsed.error.issues[0]?.message ||
        "Manual WhatsApp handoff update is invalid."
    };
  }

  try {
    const context = await getFollowUpContext(parsed.data.studentId);

    if (context.whatsappProvider !== "manual_handoff") {
      return {
        ok: false as const,
        error:
          "Manual WhatsApp handoff is disabled because the active provider is not manual_handoff."
      };
    }

    if (context.communicationSettingsError) {
      return {
        ok: false as const,
        error: context.communicationSettingsError
      };
    }

    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("whatsapp_handoffs")
      .select("id, status")
      .eq("agency_id", context.profile.agency_id)
      .eq("profile_id", context.profile.id)
      .eq("student_id", parsed.data.studentId)
      .order("opened_at", { ascending: false })
      .limit(1);

    if (parsed.data.handoffId) {
      query = query.eq("id", parsed.data.handoffId);
    }

    const { data: handoff, error: findError } = await query.maybeSingle();

    if (findError) {
      throw new Error(findError.message);
    }

    if (!handoff) {
      return {
        ok: false as const,
        error: "Open WhatsApp first, then mark the handoff as sent."
      };
    }

    const markedSentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("whatsapp_handoffs")
      .update({
        status: "sent_manually",
        marked_sent_at: markedSentAt
      })
      .eq("id", handoff.id)
      .eq("agency_id", context.profile.agency_id)
      .eq("profile_id", context.profile.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await writeAuditLog({
      agencyId: context.profile.agency_id,
      actorProfileId: context.profile.id,
      tableName: "whatsapp_handoffs",
      recordId: handoff.id,
      action: "whatsapp_handoff_sent_manually",
      metadata: {
        student_id: parsed.data.studentId,
        marked_sent_at: markedSentAt
      }
    });

    revalidatePath(`/students/${parsed.data.studentId}/follow-up`);

    return {
      ok: true as const,
      handoffId: handoff.id,
      status: "sent_manually" as const
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? manualHandoffFeatureError(error.message)
        : "WhatsApp handoff could not be marked as sent.";

    captureAppError(error, {
      module: "communication",
      action: "manual_whatsapp_handoff_mark_sent",
      studentId: input.studentId
    });

    return {
      ok: false as const,
      error: message
    };
  }
}

export async function sendFollowUpWhatsAppAction(input: {
  studentId: string;
  messageType: MessageType;
  body: string;
}) {
  const parsed = sendMessageSchema.parse(input);
  const activeProvider = getConfiguredWhatsAppProvider();

  if (activeProvider !== "twilio") {
    return {
      ok: false as const,
      status: "failed" as const,
      error:
        "WhatsApp API sending is disabled in manual handoff mode. Use Open in WhatsApp instead."
    };
  }

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
      status: "failed" as const,
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
    errorMessage =
      error instanceof Error ? error.message : "Twilio send failed.";
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
      status: "failed" as const,
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
