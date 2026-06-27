"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import { requireCurrentProfile } from "@/lib/actions/students";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureAppError } from "@/lib/monitoring/sentry";

const verificationStatusSchema = z.enum([
  "not_required",
  "required",
  "pending",
  "verified",
  "failed",
  "suspicious",
  "manual_review",
  "api_not_connected"
]);

export async function getVerificationCenter(studentId: string) {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const [{ data: providers, error: providersError }, { data: requests, error: requestsError }] =
    await Promise.all([
      supabase
        .from("verification_providers")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("verification_requests")
        .select("*, provider:verification_providers(*)")
        .eq("agency_id", profile.agency_id)
        .eq("student_id", studentId)
        .order("created_at")
    ]);

  if (providersError) {
    throw new Error(providersError.message);
  }

  if (requestsError) {
    throw new Error(requestsError.message);
  }

  return { providers: providers ?? [], requests: requests ?? [] };
}

export async function ensureVerificationWorkflowAction(formData: FormData) {
  const studentId = z.string().uuid().parse(formData.get("student_id"));
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { providers, requests } = await getVerificationCenter(studentId);
  const existingProviderIds = new Set(requests.map((request) => request.provider_id));
  const inserts = providers
    .filter((provider) => !existingProviderIds.has(provider.id))
    .map((provider) => ({
      agency_id: profile.agency_id,
      student_id: studentId,
      provider_id: provider.id,
      requested_by: profile.id,
      status: "api_not_connected",
      instructions: `${provider.name} is tracked manually. API integration is future/not connected.`
    }));

  if (inserts.length) {
    const { error } = await supabase.from("verification_requests").insert(inserts);
    if (error) {
      captureAppError(error, {
        module: "verification",
        action: "verification_workflow_create",
        agencyId: profile.agency_id,
        studentId
      });
      throw new Error(error.message);
    }
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "verification_requests",
    recordId: studentId,
    action: "verification_workflow_created",
    metadata: { created_count: inserts.length }
  });

  revalidatePath(`/students/${studentId}/verification`);
}

export async function updateVerificationRequestAction(formData: FormData) {
  const parsed = z
    .object({
      id: z.string().uuid(),
      student_id: z.string().uuid(),
      status: verificationStatusSchema,
      portal_reference: z.string().trim().optional(),
      instructions: z.string().trim().optional()
    })
    .parse(Object.fromEntries(formData));
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("verification_requests")
    .update({
      status: parsed.status,
      portal_reference: parsed.portal_reference || null,
      instructions: parsed.instructions || null,
      submitted_at: ["required", "pending", "verified", "manual_review"].includes(parsed.status)
        ? new Date().toISOString()
        : null,
      completed_at: ["verified", "failed", "not_required"].includes(parsed.status)
        ? new Date().toISOString()
        : null
    })
    .eq("agency_id", profile.agency_id)
    .eq("id", parsed.id);

  if (error) {
    captureAppError(error, {
      module: "verification",
      action: "verification_status_update",
      agencyId: profile.agency_id,
      studentId: parsed.student_id
    });
    throw new Error(error.message);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "verification_requests",
    recordId: parsed.id,
    action: "verification_status_updated",
    newData: parsed
  });

  revalidatePath(`/students/${parsed.student_id}/verification`);
}
