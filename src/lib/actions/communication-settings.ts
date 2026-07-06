"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { upsertCommunicationSettings } from "@/lib/communication/settings";
import { captureAppError } from "@/lib/monitoring/sentry";

const saveCommunicationSettingsSchema = z.object({
  consultant_whatsapp_number: z.string().trim().max(50).optional().or(z.literal("")),
  consultant_whatsapp_display_name: z
    .string()
    .trim()
    .min(2, "Display name is required.")
    .max(120),
  message_signature: z.string().trim().max(1000).optional().or(z.literal(""))
});

export async function saveCommunicationSettingsAction(formData: FormData) {
  const parsed = saveCommunicationSettingsSchema.safeParse(
    Object.fromEntries(formData)
  );

  if (!parsed.success) {
    redirect(
      `/settings?error=${encodeURIComponent(
        parsed.error.issues[0]?.message || "Invalid communication settings."
      )}`
    );
  }

  try {
    await upsertCommunicationSettings({
      whatsapp_provider: "manual_handoff",
      default_followup_channel: "whatsapp",
      consultant_whatsapp_number:
        parsed.data.consultant_whatsapp_number || null,
      consultant_whatsapp_display_name:
        parsed.data.consultant_whatsapp_display_name,
      message_signature: parsed.data.message_signature || null
    });

    revalidatePath("/settings");
    revalidatePath("/students");
    redirect(
      "/settings?success=Communication%20settings%20saved."
    );
  } catch (error) {
    captureAppError(error, {
      module: "communication",
      action: "communication_settings_save"
    });
    redirect(
      `/settings?error=${encodeURIComponent(
        error instanceof Error
          ? error.message
          : "Communication settings could not be saved."
      )}`
    );
  }
}
