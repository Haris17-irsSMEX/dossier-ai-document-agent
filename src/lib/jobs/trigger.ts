import "server-only";

import { configure, tasks } from "@trigger.dev/sdk/v3";

import { captureAppError } from "@/lib/monitoring/sentry";
import {
  getTriggerEnv,
  isTriggerConfigured
} from "@/lib/server-env";

export const triggerJobNames = {
  documentScan: "document_scan",
  aiDocumentCheck: "ai_document_check",
  whatsappFollowUpSend: "whatsapp_followup_send",
  emailFollowUpSend: "email_followup_send",
  exportPacketGenerate: "export_packet_generate",
  deadlineReminderCheck: "deadline_reminder_check"
} as const;

export type TriggerJobName =
  (typeof triggerJobNames)[keyof typeof triggerJobNames];

let configured = false;

export function configureTriggerDev() {
  if (configured) {
    return;
  }

  if (!isTriggerConfigured()) {
    throw new Error("Trigger.dev is not configured.");
  }

  configure({ accessToken: getTriggerEnv().TRIGGER_SECRET_KEY });
  configured = true;
}

export async function enqueueTriggerJob(
  jobName: TriggerJobName,
  payload: Record<string, unknown>
) {
  try {
    configureTriggerDev();
    return await tasks.trigger(jobName, payload);
  } catch (error) {
    captureAppError(error, {
      module: "jobs",
      action: jobName,
      provider: "trigger.dev",
      extra: { payloadKeys: Object.keys(payload) }
    });
    throw new Error(
      `Trigger.dev job enqueue failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
