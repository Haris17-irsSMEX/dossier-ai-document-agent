"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import { getStudent, requireCurrentProfile } from "@/lib/actions/students";
import { isActiveChecklistRequest } from "@/lib/checklists/request-logic";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  providerDetails,
  safeExternalUrl,
  suggestVerificationWorkflows,
  verificationProviders,
  verificationWorkflowStatuses,
  type VerificationProvider,
  type VerificationWorkflow
} from "@/lib/verification/manual-verification";

const verificationWorkflowInputSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  provider: z.enum(verificationProviders),
  providerLabel: z.string().trim().min(2, "Provider name is required.").max(120),
  status: z.enum(verificationWorkflowStatuses),
  referenceNumber: z.string().trim().max(160).optional(),
  selectedBoard: z.string().trim().max(160).optional(),
  officialUrl: z.string().trim().max(1000).optional(),
  evidenceUrl: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(5000).optional()
});

const manualWorkflowInputSchema = z.object({
  studentId: z.string().uuid(),
  provider: z.enum(verificationProviders),
  providerLabel: z.string().trim().max(120).optional()
});

type ChecklistRequestRow = {
  id: string;
  document_name: string;
  status?: string | null;
  requirement_level?: string | null;
  is_required?: boolean | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  visible_to_student?: boolean | null;
  is_archived?: boolean | null;
};

type WorkflowRow = Omit<VerificationWorkflow, "related_documents">;

function revalidateVerificationPages(studentId: string) {
  revalidatePath(`/students/${studentId}/verification`);
  revalidatePath(`/students/${studentId}/export`);
}

function safeActionError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || fallback;
  }

  return fallback;
}

async function getVerificationContext(studentId: string) {
  const [profile, student] = await Promise.all([
    requireCurrentProfile(),
    getStudent(studentId)
  ]);

  return {
    profile,
    student,
    supabase: await createSupabaseServerClient()
  };
}

export async function ensureSuggestedVerificationWorkflows(studentId: string) {
  const { profile, student, supabase } = await getVerificationContext(studentId);
  const { data: checklistItems, error: checklistError } = await supabase
    .from("checklist_items")
    .select(
      "id, document_name, status, requirement_level, is_required, is_requested, counts_toward_completion, visible_to_student, is_archived"
    )
    .eq("student_id", studentId)
    .eq("agency_id", student.agency_id)
    .eq("is_archived", false);

  if (checklistError) {
    throw new Error(checklistError.message);
  }

  const requestedDocuments = ((checklistItems ?? []) as ChecklistRequestRow[])
    .filter(
      (item) =>
        isActiveChecklistRequest(item) && item.visible_to_student !== false
    )
    .map((item) => ({ id: item.id, document_name: item.document_name }));
  const suggestions = suggestVerificationWorkflows(
    requestedDocuments,
    student.education_background
  );

  if (!suggestions.length) {
    return { createdCount: 0 };
  }

  const { data: existing, error: existingError } = await supabase
    .from("verification_workflows")
    .select("id, provider, related_document_request_ids")
    .eq("agency_id", student.agency_id)
    .eq("student_id", studentId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingByProvider = new Map(
    (existing ?? []).map((workflow) => [workflow.provider, workflow])
  );
  const newSuggestions = suggestions.filter(
    (suggestion) => !existingByProvider.has(suggestion.provider)
  );

  if (newSuggestions.length) {
    const { error: insertError } = await supabase
      .from("verification_workflows")
      .upsert(
        newSuggestions.map((suggestion) => ({
          agency_id: student.agency_id,
          student_id: studentId,
          provider: suggestion.provider,
          provider_label: suggestion.providerLabel,
          related_document_request_ids: suggestion.relatedDocuments.map(
            (document) => document.id
          ),
          status: "not_started",
          created_by: profile.id,
          updated_by: profile.id
        })),
        {
          onConflict: "student_id,provider",
          ignoreDuplicates: true
        }
      );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const relatedDocumentUpdates = await Promise.all(
    suggestions
      .filter((suggestion) => existingByProvider.has(suggestion.provider))
      .map((suggestion) =>
        supabase
          .from("verification_workflows")
          .update({
            related_document_request_ids: suggestion.relatedDocuments.map(
              (document) => document.id
            ),
            updated_by: profile.id
          })
          .eq("id", existingByProvider.get(suggestion.provider)!.id)
          .eq("agency_id", student.agency_id)
      )
  );

  const relatedDocumentUpdateError = relatedDocumentUpdates.find(
    (result) => result.error
  )?.error;

  if (relatedDocumentUpdateError) {
    throw new Error(relatedDocumentUpdateError.message);
  }

  if (newSuggestions.length) {
    await writeAuditLog({
      agencyId: student.agency_id,
      actorProfileId: profile.id,
      tableName: "verification_workflows",
      recordId: studentId,
      action: "verification_workflows_suggested",
      metadata: {
        providers: newSuggestions.map((suggestion) => suggestion.provider)
      }
    });
  }

  return { createdCount: newSuggestions.length };
}

export async function getStudentVerificationWorkflows(
  studentId: string
): Promise<VerificationWorkflow[]> {
  const { student, supabase } = await getVerificationContext(studentId);
  const [{ data: workflows, error: workflowError }, { data: checklistItems }] =
    await Promise.all([
      supabase
        .from("verification_workflows")
        .select("*")
        .eq("agency_id", student.agency_id)
        .eq("student_id", studentId)
        .order("created_at"),
      supabase
        .from("checklist_items")
        .select("id, document_name")
        .eq("agency_id", student.agency_id)
        .eq("student_id", studentId)
    ]);

  if (workflowError) {
    throw new Error(workflowError.message);
  }

  const documentById = new Map(
    (checklistItems ?? []).map((item) => [item.id, item.document_name])
  );

  return ((workflows ?? []) as WorkflowRow[]).map((workflow) => ({
    ...workflow,
    related_documents: (workflow.related_document_request_ids ?? [])
      .map((id) => ({ id, document_name: documentById.get(id) || "Document request" }))
  }));
}

export async function getVerificationCenter(studentId: string) {
  await ensureSuggestedVerificationWorkflows(studentId);
  return getStudentVerificationWorkflows(studentId);
}

export async function refreshVerificationSuggestions(studentId: string) {
  try {
    const parsed = z.string().uuid().parse(studentId);
    const result = await ensureSuggestedVerificationWorkflows(parsed);

    revalidateVerificationPages(parsed);
    return {
      ok: true as const,
      message: result.createdCount
        ? "Verification suggestions refreshed."
        : "Verification suggestions are up to date."
    };
  } catch (error) {
    captureAppError(error, {
      module: "verification",
      action: "verification_workflows_refresh",
      studentId
    });
    return {
      ok: false as const,
      error: "Could not refresh verification suggestions."
    };
  }
}

export async function upsertVerificationWorkflow(input: {
  id?: string;
  studentId: string;
  provider: VerificationProvider;
  providerLabel: string;
  status: string;
  referenceNumber?: string;
  selectedBoard?: string;
  officialUrl?: string;
  evidenceUrl?: string;
  notes?: string;
}) {
  try {
    const parsed = verificationWorkflowInputSchema.parse(input);
    const { profile, student, supabase } = await getVerificationContext(
      parsed.studentId
    );
    const officialUrl = safeExternalUrl(parsed.officialUrl);

    if (parsed.officialUrl && !officialUrl) {
      return { ok: false as const, error: "Enter a valid official portal link." };
    }

    const update = {
      provider_label: parsed.providerLabel,
      status: parsed.status,
      reference_number: parsed.referenceNumber || null,
      selected_board: parsed.provider === "board" ? parsed.selectedBoard || null : null,
      official_url: officialUrl,
      evidence_url: parsed.evidenceUrl || null,
      notes: parsed.notes || null,
      verified_at:
        parsed.status === "verified" ? new Date().toISOString() : null,
      updated_by: profile.id
    };

    let query = supabase
      .from("verification_workflows")
      .update(update)
      .eq("agency_id", student.agency_id)
      .eq("student_id", parsed.studentId)
      .eq("provider", parsed.provider);

    if (parsed.id) {
      query = query.eq("id", parsed.id);
    }

    const { data, error } = await query.select("id").maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Verification workflow was not found.");
    }

    await writeAuditLog({
      agencyId: student.agency_id,
      actorProfileId: profile.id,
      tableName: "verification_workflows",
      recordId: data.id,
      action: "verification_workflow_updated",
      newData: update
    });

    revalidateVerificationPages(parsed.studentId);
    return { ok: true as const, message: "Verification status saved." };
  } catch (error) {
    captureAppError(error, {
      module: "verification",
      action: "verification_workflow_update",
      studentId: input.studentId
    });
    return {
      ok: false as const,
      error: safeActionError(error, "Could not save verification status.")
    };
  }
}

export async function markVerificationNotRequired(input: {
  workflowId: string;
  studentId: string;
}) {
  try {
    const parsed = z
      .object({ workflowId: z.string().uuid(), studentId: z.string().uuid() })
      .parse(input);
    const { profile, student, supabase } = await getVerificationContext(
      parsed.studentId
    );
    const { data, error } = await supabase
      .from("verification_workflows")
      .update({
        status: "not_required",
        verified_at: null,
        updated_by: profile.id
      })
      .eq("id", parsed.workflowId)
      .eq("student_id", parsed.studentId)
      .eq("agency_id", student.agency_id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || "Verification workflow was not found.");
    }

    await writeAuditLog({
      agencyId: student.agency_id,
      actorProfileId: profile.id,
      tableName: "verification_workflows",
      recordId: data.id,
      action: "verification_workflow_not_required"
    });

    revalidateVerificationPages(parsed.studentId);
    return { ok: true as const, message: "Marked as not required." };
  } catch (error) {
    captureAppError(error, {
      module: "verification",
      action: "verification_workflow_not_required",
      studentId: input.studentId
    });
    return { ok: false as const, error: "Could not update this verification." };
  }
}

export async function addManualVerificationWorkflow(input: {
  studentId: string;
  provider: VerificationProvider;
  providerLabel?: string;
}) {
  try {
    const parsed = manualWorkflowInputSchema.parse(input);
    const { profile, student, supabase } = await getVerificationContext(
      parsed.studentId
    );
    const providerLabel =
      parsed.provider === "other"
        ? parsed.providerLabel?.trim()
        : providerDetails[parsed.provider].label;

    if (!providerLabel) {
      return { ok: false as const, error: "Enter a name for this verification." };
    }

    const { data: existing } = await supabase
      .from("verification_workflows")
      .select("id")
      .eq("student_id", parsed.studentId)
      .eq("provider", parsed.provider)
      .maybeSingle();

    if (existing) {
      return {
        ok: true as const,
        message: "This verification is already being tracked."
      };
    }

    const { data, error } = await supabase
      .from("verification_workflows")
      .insert({
        agency_id: student.agency_id,
        student_id: parsed.studentId,
        provider: parsed.provider,
        provider_label: providerLabel,
        status: "not_started",
        related_document_request_ids: [],
        created_by: profile.id,
        updated_by: profile.id
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not add verification workflow.");
    }

    await writeAuditLog({
      agencyId: student.agency_id,
      actorProfileId: profile.id,
      tableName: "verification_workflows",
      recordId: data.id,
      action: "verification_workflow_added_manually",
      metadata: { provider: parsed.provider }
    });

    revalidateVerificationPages(parsed.studentId);
    return { ok: true as const, message: "Manual verification added." };
  } catch (error) {
    captureAppError(error, {
      module: "verification",
      action: "verification_workflow_add_manual",
      studentId: input.studentId
    });
    return {
      ok: false as const,
      error: safeActionError(error, "Could not add manual verification.")
    };
  }
}
