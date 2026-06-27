import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { triggerJobNames } from "@/lib/jobs/trigger";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const payloadSchema = z.object({
  agencyId: z.string().uuid(),
  daysAhead: z.number().int().min(1).max(30).optional().default(7)
});

export const deadlineReminderCheckTask = task({
  id: triggerJobNames.deadlineReminderCheck,
  run: async (payload: unknown) => {
    const input = payloadSchema.parse(payload);

    try {
      const admin = createSupabaseAdminClient();
      const cutoff = new Date(
        Date.now() + input.daysAhead * 86_400_000
      ).toISOString();
      const { data, error } = await admin
        .from("students")
        .select("id, full_name, deadline_date")
        .eq("agency_id", input.agencyId)
        .not("deadline_date", "is", null)
        .lte("deadline_date", cutoff.slice(0, 10))
        .order("deadline_date");

      if (error) {
        throw new Error(error.message);
      }

      await createAuditLog({
        agencyId: input.agencyId,
        tableName: "students",
        action: "deadline_reminder_check_completed",
        metadata: {
          source: "trigger.dev",
          days_ahead: input.daysAhead,
          students_found: data?.length ?? 0
        }
      });

      return { ok: true, students: data ?? [] };
    } catch (error) {
      captureAppError(error, {
        module: "jobs",
        action: triggerJobNames.deadlineReminderCheck,
        provider: "trigger.dev",
        agencyId: input.agencyId
      });
      throw error;
    }
  }
});
