import "server-only";

import twilio from "twilio";

import {
  getTwilioEnv,
  isWhatsAppConfigured
} from "@/lib/server-env";
import { captureServerError } from "@/lib/monitoring/sentry";
import type { WhatsAppMessageInput, WhatsAppMessageResult } from "@/lib/types";

let twilioClient: ReturnType<typeof twilio> | null = null;

export function formatWhatsAppAddress(value: string, label = "WhatsApp number") {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  const rawNumber = trimmed.toLowerCase().startsWith("whatsapp:")
    ? trimmed.slice("whatsapp:".length).trim()
    : trimmed;
  let normalized = rawNumber.replace(/[\s()-]/g, "");

  if (/^03\d{9}$/.test(normalized)) {
    normalized = `+92${normalized.slice(1)}`;
  } else if (/^923\d{9}$/.test(normalized)) {
    normalized = `+${normalized}`;
  }

  if (!/^\+\d{8,15}$/.test(normalized)) {
    throw new Error(`${label} must include country code, for example +923001234567.`);
  }

  return `whatsapp:${normalized}`;
}

export function createTwilioClient() {
  if (!isWhatsAppConfigured()) {
    throw new Error("Twilio WhatsApp is not configured.");
  }

  const env = getTwilioEnv();

  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
}

function getErrorMessage(error: unknown) {
  const maybeTwilioError = error as { message?: string; code?: number; moreInfo?: string };
  const message =
    error instanceof Error
      ? error.message
      : maybeTwilioError.message || "Unknown error";
  const sandboxHint =
    message.toLowerCase().includes("not a valid whatsapp") ||
    message.toLowerCase().includes("sandbox") ||
    maybeTwilioError.code === 63015 ||
    maybeTwilioError.code === 63016
      ? " During local Twilio sandbox testing, make sure the student's number has joined your Twilio WhatsApp sandbox."
      : "";
  const senderHint =
    maybeTwilioError.code === 63007 ||
    message.toLowerCase().includes("from number")
      ? " Check TWILIO_WHATSAPP_FROM. For sandbox testing use whatsapp:+14155238886."
      : "";

  return `${message}${sandboxHint}${senderHint}`;
}

export async function sendTwilioWhatsAppMessage(
  input: WhatsAppMessageInput
): Promise<WhatsAppMessageResult> {
  const env = getTwilioEnv();
  const client = createTwilioClient();
  const to = formatWhatsAppAddress(input.to, "WhatsApp recipient number");
  const from = formatWhatsAppAddress(
    env.TWILIO_WHATSAPP_FROM,
    "Twilio WhatsApp sender number"
  );
  const body = input.body.trim();

  if (!body) {
    throw new Error("WhatsApp message body is required.");
  }

  try {
    const message = await client.messages.create({
      to,
      from,
      body
    });

    return {
      provider: "twilio",
      messageId: message.sid,
      status: message.status,
      to,
      from,
      studentId: input.studentId,
      messageType: input.messageType,
      sentAt: new Date().toISOString()
    };
  } catch (error) {
    captureServerError(error, {
      module: "messaging",
      action: "twilio.sendWhatsAppMessage",
      extra: {
        to,
        studentId: input.studentId,
        messageType: input.messageType
      }
    });
    throw new Error(`Twilio WhatsApp send failed: ${getErrorMessage(error)}`);
  }
}
