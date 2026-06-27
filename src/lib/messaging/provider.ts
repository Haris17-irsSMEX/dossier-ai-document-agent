import "server-only";

import { getTwilioEnv } from "@/lib/server-env";
import { sendTwilioWhatsAppMessage } from "@/lib/messaging/twilio";
import type {
  WhatsAppMessageInput,
  WhatsAppMessageResult
} from "@/lib/types";

export async function sendWhatsAppMessage(
  input: WhatsAppMessageInput
): Promise<WhatsAppMessageResult> {
  const env = getTwilioEnv();

  switch (env.WHATSAPP_PROVIDER) {
    case "twilio":
      return sendTwilioWhatsAppMessage(input);
    default:
      throw new Error(`Unsupported WhatsApp provider: ${env.WHATSAPP_PROVIDER}`);
  }
}

export const messagingProvider = {
  sendWhatsAppMessage
};
