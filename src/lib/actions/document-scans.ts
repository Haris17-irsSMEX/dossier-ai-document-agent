"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { checkDocumentWithDeepSeek } from "@/lib/ai/document-check";
import {
  normalizeDocumentIssueType,
  type DocumentCheckIssue
} from "@/lib/ai/document-check-schema";
import { requireCurrentProfile } from "@/lib/actions/students";
import { createAuditLog } from "@/lib/actions/audit";
import type { ChecklistStatus } from "@/lib/checklists/rules";
import {
  mapStorageBucketErrorMessage,
  STUDENT_DOCUMENTS_BUCKET
} from "@/lib/constants";
import {
  resolveDocumentStatus,
  runDocumentRules
} from "@/lib/document-checks/rules";
import {
  extractTextWithAzureDocumentIntelligence,
  isAzureOcrConfigured
} from "@/lib/ocr/azure";
import { captureServerError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDeepSeekConfigured } from "@/lib/server-env";

type Profile = {
  id: string;
  agency_id: string;
};

type StudentRecord = {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  target_country?: string | null;
  destination_country?: string | null;
  program_level?: string | null;
  education_background?: string | null;
  sponsor_type?: string | null;
};

type DocumentPartRecord = {
  id: string;
  part_name: string;
  is_required: boolean;
};

type ChecklistItemRecord = {
  id: string;
  document_name: string;
  category: string;
  instructions?: string | null;
  accepted_formats: string[];
  upload_type: string;
  required_parts?: unknown;
  ai_validation_enabled?: boolean | null;
  expiry_validation_enabled?: boolean | null;
  document_parts?: DocumentPartRecord[] | null;
};

type UploadedDocumentRecord = {
  id: string;
  agency_id: string;
  student_id: string;
  checklist_item_id: string;
  document_part_id?: string | null;
  storage_bucket?: string | null;
  storage_path: string;
  original_filename: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  status?: ChecklistStatus;
  student: StudentRecord;
  checklist_item: ChecklistItemRecord;
  document_part?: DocumentPartRecord | null;
};

type DocumentForItem = {
  id: string;
  document_part_id?: string | null;
  original_filename: string;
  mime_type?: string | null;
  status?: string | null;
};

const scanSchema = z.object({
  documentId: z.string().uuid()
});

function buildManualReviewIssue(message: string): DocumentCheckIssue {
  return {
    type: "needs_manual_review",
    severity: "medium",
    message,
    evidence: "Automated scanning could not complete every validation step.",
    recommended_action: "Review the uploaded file manually before accepting it."
  };
}

const AZURE_SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);

const AZURE_SUPPORTED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const SAFE_SCAN_UNAVAILABLE_MESSAGE =
  "AI scan unavailable. Manual review needed.";
const HEIC_MANUAL_REVIEW_MESSAGE =
  "AI scan unavailable. Manual review needed. This file type may require manual review.";

function documentExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function isHeicLikeDocument(document: UploadedDocumentRecord) {
  const mimeType = document.mime_type?.toLowerCase() || "";
  const extension = documentExtension(document.original_filename);

  return HEIC_MIME_TYPES.has(mimeType) || HEIC_EXTENSIONS.has(extension);
}

function azureSupportMessage(document: UploadedDocumentRecord) {
  const mimeType = document.mime_type?.toLowerCase() || "";
  const extension = documentExtension(document.original_filename);

  if (AZURE_SUPPORTED_MIME_TYPES.has(mimeType)) {
    return null;
  }

  if (!mimeType && AZURE_SUPPORTED_EXTENSIONS.has(extension)) {
    return null;
  }

  if (isHeicLikeDocument(document)) {
    return HEIC_MANUAL_REVIEW_MESSAGE;
  }

  return SAFE_SCAN_UNAVAILABLE_MESSAGE;
}

function scanStatusForDocumentStatus(status: ChecklistStatus) {
  return status === "accepted" ? "scanned" : "needs_review";
}

function normalizeConfidence(confidence: number | null) {
  if (typeof confidence !== "number") {
    return null;
  }

  return Math.max(0, Math.min(1, Number(confidence.toFixed(4))));
}

function requiredPartsForItem(item: ChecklistItemRecord): DocumentPartRecord[] {
  if (Array.isArray(item.document_parts) && item.document_parts.length) {
    return item.document_parts;
  }

  if (Array.isArray(item.required_parts)) {
    return item.required_parts
      .filter(
        (part): part is { part_name: string; is_required: boolean } =>
          typeof part?.part_name === "string"
      )
      .map((part) => ({
        id: "",
        part_name: part.part_name,
        is_required: Boolean(part.is_required)
      }));
  }

  return [];
}

function shouldMarkChecklistAccepted(input: {
  status: ChecklistStatus;
  uploadType: string;
  currentDocumentId: string;
  currentDocumentPartId?: string | null;
  documentsForItem: DocumentForItem[];
  requiredParts: DocumentPartRecord[];
}) {
  if (input.status !== "accepted") {
    return false;
  }

  if (input.uploadType === "single") {
    return true;
  }

  if (input.uploadType !== "multi_part") {
    return false;
  }

  const acceptedPartIds = new Set(
    input.documentsForItem
      .filter((document) => {
        if (document.id === input.currentDocumentId) {
          return true;
        }

        return document.status === "accepted";
      })
      .map((document) =>
        document.id === input.currentDocumentId
          ? input.currentDocumentPartId
          : document.document_part_id
      )
      .filter(Boolean)
  );

  return input.requiredParts
    .filter((part) => part.is_required)
    .every((part) => part.id && acceptedPartIds.has(part.id));
}

async function loadDocumentForScan(
  documentId: string,
  agencyId: string
): Promise<UploadedDocumentRecord> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      [
        "*",
        "student:students(*)",
        "checklist_item:checklist_items(*, document_parts(*))",
        "document_part:document_parts(*)"
      ].join(", ")
    )
    .eq("agency_id", agencyId)
    .eq("id", documentId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Document not found.");
  }

  return data as unknown as UploadedDocumentRecord;
}

async function listDocumentsForChecklistItem(document: UploadedDocumentRecord) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, document_part_id, original_filename, mime_type, status")
    .eq("agency_id", document.agency_id)
    .eq("checklist_item_id", document.checklist_item_id);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentForItem[];
}

async function downloadDocumentBytes(document: UploadedDocumentRecord) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(document.storage_bucket || STUDENT_DOCUMENTS_BUCKET)
    .download(document.storage_path);

  if (error || !data) {
    throw new Error(
      mapStorageBucketErrorMessage(
        error?.message || "Could not download document."
      )
    );
  }

  return Buffer.from(await data.arrayBuffer());
}

async function resolvePreviousIssues(
  document: UploadedDocumentRecord,
  actorProfileId?: string | null
) {
  const supabase = createSupabaseAdminClient();
  const update: Record<string, string | boolean | null> = {
    is_resolved: true,
    resolved_at: new Date().toISOString()
  };

  if (actorProfileId) {
    update.resolved_by = actorProfileId;
  }

  const { error } = await supabase
    .from("document_issues")
    .update(update)
    .eq("agency_id", document.agency_id)
    .eq("document_id", document.id)
    .eq("is_resolved", false);

  if (error) {
    throw new Error(error.message);
  }
}

async function insertIssues(
  document: UploadedDocumentRecord,
  issues: DocumentCheckIssue[]
) {
  if (!issues.length) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("document_issues").insert(
    issues.map((issue) => ({
      agency_id: document.agency_id,
      student_id: document.student_id,
      checklist_item_id: document.checklist_item_id,
      document_id: document.id,
      issue_type: normalizeDocumentIssueType(issue.type),
      message: issue.message,
      severity: issue.severity,
      evidence: issue.evidence,
      recommended_action: issue.recommended_action
    }))
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function updateChecklistAndPartStatus(input: {
  document: UploadedDocumentRecord;
  status: ChecklistStatus;
  documentsForItem: DocumentForItem[];
  requiredParts: DocumentPartRecord[];
}) {
  const supabase = createSupabaseAdminClient();
  const allRequiredPartsAccepted = shouldMarkChecklistAccepted({
    status: input.status,
    uploadType: input.document.checklist_item.upload_type,
    currentDocumentId: input.document.id,
    currentDocumentPartId: input.document.document_part_id,
    documentsForItem: input.documentsForItem,
    requiredParts: input.requiredParts
  });
  const checklistStatus = allRequiredPartsAccepted
    ? "accepted"
    : input.status === "accepted" &&
        input.document.checklist_item.upload_type === "multi_part"
      ? "needs_review"
      : input.status;

  const { error: checklistError } = await supabase
    .from("checklist_items")
    .update({ status: checklistStatus })
    .eq("agency_id", input.document.agency_id)
    .eq("id", input.document.checklist_item_id);

  if (checklistError) {
    throw new Error(checklistError.message);
  }

  if (input.document.document_part_id) {
    const { error: partError } = await supabase
      .from("document_parts")
      .update({
        status: input.status === "accepted" ? "accepted" : "needs_review"
      })
      .eq("agency_id", input.document.agency_id)
      .eq("id", input.document.document_part_id);

    if (partError) {
      throw new Error(partError.message);
    }
  }
}

async function writeScanAudit(input: {
  agencyId: string;
  actorProfileId?: string | null;
  recordId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await createAuditLog({
    agencyId: input.agencyId,
    actorProfileId: input.actorProfileId ?? undefined,
    tableName: "documents",
    recordId: input.recordId,
    action: input.action,
    metadata: input.metadata
  });
}

async function markScanFailure(input: {
  document: UploadedDocumentRecord;
  actorProfileId?: string | null;
  message: string;
}) {
  const supabase = createSupabaseAdminClient();
  const issue = buildManualReviewIssue(input.message);

  try {
    await resolvePreviousIssues(input.document, input.actorProfileId);
    await insertIssues(input.document, [issue]);
  } catch (error) {
    captureServerError(error, {
      module: "documents",
      action: "scanFailureIssueSave",
      extra: { documentId: input.document.id }
    });
  }

  const { error: extractionError } = await supabase
    .from("document_extractions")
    .insert({
      agency_id: input.document.agency_id,
      student_id: input.document.student_id,
      document_id: input.document.id,
      provider: "azure_document_intelligence",
      model: "prebuilt-read",
      status: "failed",
      error_message: input.message
    });

  if (extractionError) {
    captureServerError(extractionError, {
      module: "documents",
      action: "scanFailureExtractionSave",
      extra: { documentId: input.document.id }
    });
  }

  const { error } = await supabase
    .from("documents")
    .update({
      status: "needs_review",
      scan_status: "scan_failed",
      scan_summary: input.message,
      extracted_fields: {},
      scan_error_message: input.message,
      scanned_at: new Date().toISOString()
    })
    .eq("agency_id", input.document.agency_id)
    .eq("id", input.document.id);

  if (error) {
    captureServerError(error, {
      module: "documents",
      action: "scanFailureDocumentUpdate",
      extra: { documentId: input.document.id }
    });
  }

  try {
    await updateChecklistAndPartStatus({
      document: input.document,
      status: "needs_review",
      documentsForItem: await listDocumentsForChecklistItem(input.document),
      requiredParts: requiredPartsForItem(input.document.checklist_item)
    });
  } catch (statusError) {
    captureServerError(statusError, {
      module: "documents",
      action: "scanFailureChecklistUpdate",
      extra: { documentId: input.document.id }
    });
  }

  await writeScanAudit({
    agencyId: input.document.agency_id,
    actorProfileId: input.actorProfileId,
    recordId: input.document.id,
    action: "document_scan_failed",
    metadata: { error_message: input.message }
  });
}

async function scanDocumentWithServerContext(input: {
  documentId: string;
  agencyId: string;
  actorProfileId?: string | null;
  source: "counselor" | "upload_portal";
}) {
  const supabase = createSupabaseAdminClient();
  const document = await loadDocumentForScan(input.documentId, input.agencyId);

  const { error: startError } = await supabase
    .from("documents")
    .update({
      scan_status: "scanning",
      scan_error_message: null
    })
    .eq("agency_id", input.agencyId)
    .eq("id", document.id);

  if (startError) {
    throw new Error(startError.message);
  }

  await writeScanAudit({
    agencyId: document.agency_id,
    actorProfileId: input.actorProfileId,
    recordId: document.id,
    action: "document_scan_started",
    metadata: { source: input.source }
  });

  if (!isAzureOcrConfigured()) {
    const message = SAFE_SCAN_UNAVAILABLE_MESSAGE;
    await markScanFailure({
      document,
      actorProfileId: input.actorProfileId,
      message
    });
    revalidatePath(`/students/${document.student_id}/documents`);
    return {
      ok: false,
      documentId: document.id,
      studentId: document.student_id,
      scanStatus: "scan_failed",
      documentStatus: "needs_review",
      message
    };
  }

  const unsupportedMessage = azureSupportMessage(document);

  if (unsupportedMessage) {
    await markScanFailure({
      document,
      actorProfileId: input.actorProfileId,
      message: unsupportedMessage
    });
    revalidatePath(`/students/${document.student_id}/documents`);
    return {
      ok: false,
      documentId: document.id,
      studentId: document.student_id,
      scanStatus: "scan_failed",
      documentStatus: "needs_review",
      message: unsupportedMessage
    };
  }

  try {
    const [fileBytes, documentsForItem] = await Promise.all([
      downloadDocumentBytes(document),
      listDocumentsForChecklistItem(document)
    ]);
    const ocr = await extractTextWithAzureDocumentIntelligence({
      fileBytes,
      mimeType: document.mime_type,
      filename: document.original_filename
    });
    const requiredParts = requiredPartsForItem(document.checklist_item);
    const { data: extraction, error: extractionError } = await supabase
      .from("document_extractions")
      .insert({
        agency_id: document.agency_id,
        student_id: document.student_id,
        document_id: document.id,
        provider: ocr.provider,
        model: ocr.model,
        raw_text: ocr.rawText,
        confidence: normalizeConfidence(ocr.confidence),
        extracted_fields: {
          ocr_metadata: ocr.metadata
        },
        status: "completed"
      })
      .select("id")
      .single();

    if (extractionError) {
      throw new Error(extractionError.message);
    }

    let aiResult = null;
    let aiError: string | null = null;

    if (
      document.checklist_item.ai_validation_enabled !== false &&
      isDeepSeekConfigured()
    ) {
      try {
        aiResult = await checkDocumentWithDeepSeek({
          student: document.student,
          checklistItem: {
            document_name: document.checklist_item.document_name,
            category: document.checklist_item.category,
            instructions: document.checklist_item.instructions,
            accepted_formats: document.checklist_item.accepted_formats,
            upload_type: document.checklist_item.upload_type,
            required_parts: document.checklist_item.required_parts,
            expiry_validation_enabled:
              document.checklist_item.expiry_validation_enabled
          },
          document: {
            original_filename: document.original_filename,
            mime_type: document.mime_type,
            file_size_bytes: document.file_size_bytes
          },
          documentPart: document.document_part,
          ocr: {
            rawText: ocr.rawText,
            confidence: ocr.confidence
          }
        });
      } catch (error) {
        aiError = error instanceof Error ? error.message : "DeepSeek failed.";
      }
    } else if (
      document.checklist_item.ai_validation_enabled !== false &&
      !isDeepSeekConfigured()
    ) {
      aiError =
        "DeepSeek is not configured. Counselor review is required.";
    }

    const ruleIssues = runDocumentRules({
      studentName: document.student.full_name,
      documentName: document.checklist_item.document_name,
      acceptedFormats: document.checklist_item.accepted_formats,
      uploadType: document.checklist_item.upload_type,
      requiredParts,
      documentsForItem,
      currentDocument: document,
      currentPart: document.document_part,
      expiryValidationEnabled:
        document.checklist_item.expiry_validation_enabled !== false,
      ocrText: ocr.rawText,
      ocrConfidence: ocr.confidence,
      aiResult
    });
    const allIssues = [
      ...ruleIssues,
      ...(aiResult?.issues ?? []),
      ...(aiError ? [buildManualReviewIssue(aiError)] : [])
    ];
    const finalStatus = resolveDocumentStatus({
      ruleIssues,
      aiResult,
      aiError
    });
    const scanStatus = scanStatusForDocumentStatus(finalStatus);

    await resolvePreviousIssues(document, input.actorProfileId);
    await insertIssues(document, allIssues);

    const { error: updateExtractionError } = await supabase
      .from("document_extractions")
      .update({
        extracted_fields: {
          ocr_metadata: ocr.metadata,
          ai_validation: aiResult,
          ai_validation_error: aiError
        },
        status: aiError ? "needs_review" : "completed",
        error_message: aiError
      })
      .eq("agency_id", document.agency_id)
      .eq("id", extraction.id);

    if (updateExtractionError) {
      throw new Error(updateExtractionError.message);
    }

    const { error: updateDocumentError } = await supabase
      .from("documents")
      .update({
        status: finalStatus,
        scan_status: scanStatus,
        scan_summary:
          scanStatus === "scanned"
            ? "Automatic checks completed."
            : "Automatic checks completed with items requiring counselor review.",
        extracted_fields: aiResult?.extracted_fields ?? {},
        detected_document_type: aiResult?.detected_document_type ?? null,
        scan_confidence: normalizeConfidence(
          aiResult?.confidence ?? ocr.confidence
        ),
        scan_error_message: aiError,
        scanned_at: new Date().toISOString()
      })
      .eq("agency_id", document.agency_id)
      .eq("id", document.id);

    if (updateDocumentError) {
      throw new Error(updateDocumentError.message);
    }

    await updateChecklistAndPartStatus({
      document,
      status: finalStatus,
      documentsForItem,
      requiredParts
    });

    await writeScanAudit({
      agencyId: document.agency_id,
      actorProfileId: input.actorProfileId,
      recordId: document.id,
      action: "document_scan_completed",
      metadata: {
        source: input.source,
        scan_status: scanStatus,
        document_status: finalStatus,
        issue_count: allIssues.length,
        ai_validation_enabled:
          document.checklist_item.ai_validation_enabled !== false
      }
    });

    revalidatePath(`/students/${document.student_id}/documents`);

    return {
      ok: true,
      documentId: document.id,
      studentId: document.student_id,
      scanStatus,
      documentStatus: finalStatus,
      message:
        scanStatus === "scanned"
          ? "Document scanned successfully."
          : "Document scanned and needs consultant review."
    };
  } catch (error) {
    captureServerError(error, {
      module: "documents",
      action: "scanDocument",
      extra: {
        documentId: document.id,
        studentId: document.student_id
      }
    });
    const message = SAFE_SCAN_UNAVAILABLE_MESSAGE;
    await markScanFailure({
      document,
      actorProfileId: input.actorProfileId,
      message
    });
    revalidatePath(`/students/${document.student_id}/documents`);

    return {
      ok: false,
      documentId: document.id,
      studentId: document.student_id,
      scanStatus: "scan_failed",
      documentStatus: "needs_review",
      message
    };
  }
}

export async function scanUploadedDocumentFromUploadToken(input: {
  documentId: string;
  agencyId: string;
}) {
  const parsed = scanSchema.parse({ documentId: input.documentId });

  return scanDocumentWithServerContext({
    documentId: parsed.documentId,
    agencyId: input.agencyId,
    actorProfileId: null,
    source: "upload_portal"
  });
}

export async function scanDocumentForCurrentProfile(documentId: string) {
  const parsed = scanSchema.parse({ documentId });
  const profile: Profile = await requireCurrentProfile();

  return scanDocumentWithServerContext({
    documentId: parsed.documentId,
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    source: "counselor"
  });
}
