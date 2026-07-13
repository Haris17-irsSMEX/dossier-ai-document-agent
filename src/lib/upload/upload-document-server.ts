import "server-only";

import crypto from "node:crypto";

import { z } from "zod";

import { createAuditLog } from "@/lib/actions/audit";
import { scanUploadedDocumentFromUploadToken } from "@/lib/actions/document-scans";
import {
  mapStorageBucketErrorMessage,
  STUDENT_DOCUMENTS_BUCKET
} from "@/lib/constants";
import { captureAppError } from "@/lib/monitoring/sentry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const allowedMimeByFormat: Record<string, string[]> = {
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  heic: ["image/heic", "image/heif"],
  heif: ["image/heif", "image/heic"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  pdf: ["application/pdf"],
  png: ["image/png"],
  webp: ["image/webp"]
};

const imageFormats = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);

export const directUploadPrepareSchema = z.object({
  token: z.string().min(20),
  checklistItemId: z.string().uuid(),
  documentPartId: z.string().uuid().optional().or(z.literal("")),
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().optional().or(z.literal("")),
  fileSizeBytes: z.number().int().positive()
});

export const directUploadCompleteSchema = directUploadPrepareSchema.extend({
  storagePath: z.string().trim().min(1)
});

type DirectUploadPrepareInput = z.infer<typeof directUploadPrepareSchema>;
type DirectUploadCompleteInput = z.infer<typeof directUploadCompleteSchema>;

type UploadTokenRecord = {
  id: string;
  agency_id: string;
  student_id: string;
  checklist_item_id?: string | null;
  status: string;
  expires_at: string;
  used_count?: number | null;
};

type DocumentPartRecord = {
  id: string;
  checklist_item_id: string;
  part_name: string;
  is_required: boolean;
};

type ChecklistItemRecord = {
  id: string;
  agency_id: string;
  student_id: string;
  document_name: string;
  accepted_formats: string[];
  upload_type: string;
  document_parts?: DocumentPartRecord[] | null;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function extensionFor(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return extension === "jpeg" ? "jpg" : extension;
}

function normalizeFormats(formats: string[]) {
  return formats.map((format) =>
    format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase()
  );
}

function isAllowedFileMetadata(input: {
  filename: string;
  mimeType?: string | null;
  acceptedFormats: string[];
}) {
  const normalizedFormats = normalizeFormats(input.acceptedFormats);
  const extension = extensionFor(input.filename);
  const normalizedMimeType = input.mimeType?.toLowerCase() || "";
  const acceptsImages = normalizedFormats.some((format) => imageFormats.has(format));
  const looksLikeImage =
    normalizedMimeType.startsWith("image/") || imageFormats.has(extension);
  const mimeOk = normalizedFormats.some((format) =>
    allowedMimeByFormat[format]?.includes(normalizedMimeType)
  );

  return (
    normalizedFormats.includes(extension) ||
    mimeOk ||
    (acceptsImages && looksLikeImage)
  );
}

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "upload";
}

function studentScanMessage(input: {
  ok: boolean;
  documentStatus?: string;
  scanStatus?: string;
}) {
  if (!input.ok || input.scanStatus === "scan_failed") {
    return "Uploaded successfully. Automatic scan needs counselor review.";
  }

  switch (input.documentStatus) {
    case "accepted":
      return "Looks clear.";
    case "blurry":
      return "Please retake. The image looks blurry.";
    case "wrong_document":
      return "This may be the wrong document.";
    case "suspicious":
    case "needs_review":
    default:
      return "Needs counselor review.";
  }
}

async function loadUploadToken(token: string) {
  const supabase = createSupabaseAdminClient();
  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from("upload_tokens")
    .select(
      "id, agency_id, student_id, checklist_item_id, status, expires_at, used_count"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("[upload-document] token validation failed", error);
    throw new Error("Could not validate upload link.");
  }

  return data as UploadTokenRecord | null;
}

async function loadChecklistItem(input: {
  uploadToken: UploadTokenRecord;
  checklistItemId: string;
}) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("checklist_items")
    .select(
      "id, agency_id, student_id, document_name, accepted_formats, upload_type, document_parts(id, checklist_item_id, part_name, is_required)"
    )
    .eq("agency_id", input.uploadToken.agency_id)
    .eq("student_id", input.uploadToken.student_id)
    .eq("visible_to_student", true)
    .eq("is_requested", true)
    .eq("is_archived", false)
    .eq("id", input.checklistItemId)
    .maybeSingle();

  if (error) {
    console.error("[upload-document] checklist item lookup failed", error);
    throw new Error("Could not validate document request.");
  }

  return data as ChecklistItemRecord | null;
}

function validateUploadToken(
  uploadToken: UploadTokenRecord | null,
  checklistItemId: string
) {
  if (!uploadToken) {
    throw new Error("Upload link is invalid.");
  }

  if (
    uploadToken.status !== "active" ||
    new Date(uploadToken.expires_at) < new Date()
  ) {
    throw new Error("Upload link has expired.");
  }

  if (
    uploadToken.checklist_item_id &&
    uploadToken.checklist_item_id !== checklistItemId
  ) {
    throw new Error("This upload link is not valid for that document request.");
  }
}

function validateDocumentPart(input: {
  checklistItem: ChecklistItemRecord;
  documentPartId?: string | null;
}) {
  const parts = input.checklistItem.document_parts ?? [];
  const documentPart = input.documentPartId
    ? parts.find((part) => part.id === input.documentPartId)
    : null;

  if (input.documentPartId && !documentPart) {
    throw new Error("Document part was not found for this request.");
  }

  if (input.checklistItem.upload_type === "multi_part" && !documentPart) {
    throw new Error("Choose the document part you are uploading.");
  }

  if (input.checklistItem.upload_type !== "multi_part" && documentPart) {
    throw new Error("This document request does not accept document parts.");
  }

  return documentPart ?? null;
}

async function validateDirectUploadInput(
  input: DirectUploadPrepareInput | DirectUploadCompleteInput
) {
  if (input.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large. Upload a file up to 20 MB.");
  }

  const uploadToken = await loadUploadToken(input.token);

  validateUploadToken(uploadToken, input.checklistItemId);

  const checklistItem = await loadChecklistItem({
    uploadToken: uploadToken as UploadTokenRecord,
    checklistItemId: input.checklistItemId
  });

  if (!checklistItem) {
    throw new Error("Document request was not found.");
  }

  const acceptedFormats = checklistItem.accepted_formats ?? [];

  if (
    !isAllowedFileMetadata({
      filename: input.filename,
      mimeType: input.mimeType,
      acceptedFormats
    })
  ) {
    throw new Error(
      `${checklistItem.document_name} must be ${acceptedFormats
        .join(", ")
        .toUpperCase()}.`
    );
  }

  const documentPart = validateDocumentPart({
    checklistItem,
    documentPartId: input.documentPartId || null
  });

  return {
    uploadToken: uploadToken as UploadTokenRecord,
    checklistItem,
    documentPart
  };
}

async function updateChecklistProgress(input: {
  agencyId: string;
  checklistItem: ChecklistItemRecord;
  documentPartId?: string | null;
  status?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const partStatus =
    input.status === "accepted"
      ? "accepted"
      : input.status === "uploaded"
        ? "uploaded"
        : "needs_review";

  if (input.documentPartId) {
    const { error: partError } = await supabase
      .from("document_parts")
      .update({ status: partStatus })
      .eq("agency_id", input.agencyId)
      .eq("id", input.documentPartId)
      .eq("checklist_item_id", input.checklistItem.id);

    if (partError) {
      console.error("[upload-document] document part update failed", partError);
      throw new Error("Uploaded file saved, but document part status could not update.");
    }
  }

  if (input.checklistItem.upload_type !== "multi_part") {
    const checklistStatus =
      input.status === "accepted"
        ? "accepted"
        : input.status && input.status !== "uploaded"
          ? "needs_review"
          : "uploaded";
    const { error } = await supabase
      .from("checklist_items")
      .update({ status: checklistStatus })
      .eq("agency_id", input.agencyId)
      .eq("id", input.checklistItem.id);

    if (error) {
      console.error("[upload-document] checklist status update failed", error);
      throw new Error("Uploaded file saved, but checklist status could not update.");
    }

    return;
  }

  const requiredParts = (input.checklistItem.document_parts ?? []).filter(
    (part) => part.is_required
  );
  const { data: itemDocuments, error: documentsError } = await supabase
    .from("documents")
    .select("document_part_id")
    .eq("agency_id", input.agencyId)
    .eq("checklist_item_id", input.checklistItem.id);

  if (documentsError) {
    console.error("[upload-document] checklist progress lookup failed", documentsError);
    throw new Error("Uploaded file saved, but checklist progress could not update.");
  }

  const uploadedPartIds = new Set(
    (itemDocuments ?? [])
      .map((document) => document.document_part_id)
      .filter(Boolean)
  );
  const allRequiredPartsUploaded = requiredParts.every((part) =>
    uploadedPartIds.has(part.id)
  );
  const checklistStatus =
    input.status === "accepted" && allRequiredPartsUploaded
      ? "uploaded"
      : input.status && input.status !== "uploaded"
        ? "needs_review"
        : allRequiredPartsUploaded
          ? "uploaded"
          : "needs_review";

  const { error } = await supabase
    .from("checklist_items")
    .update({ status: checklistStatus })
    .eq("agency_id", input.agencyId)
    .eq("id", input.checklistItem.id);

  if (error) {
    console.error("[upload-document] checklist status update failed", error);
    throw new Error("Uploaded file saved, but checklist progress could not update.");
  }
}

export async function prepareDirectDocumentUpload(input: DirectUploadPrepareInput) {
  const { uploadToken, checklistItem } = await validateDirectUploadInput(input);
  const supabase = createSupabaseAdminClient();
  const safeFilename = sanitizeFilename(input.filename);
  const storagePath = [
    uploadToken.agency_id,
    uploadToken.student_id,
    checklistItem.id,
    `${Date.now()}-${crypto.randomUUID()}-${safeFilename}`
  ].join("/");

  const { data, error } = await supabase.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    console.error("[upload-document] signed upload creation failed", error);
    captureAppError(error || new Error("Signed upload token missing."), {
      module: "upload",
      action: "signed_upload_prepare",
      provider: "supabase",
      agencyId: uploadToken.agency_id,
      studentId: uploadToken.student_id
    });
    throw new Error(mapStorageBucketErrorMessage(error?.message));
  }

  return {
    bucket: STUDENT_DOCUMENTS_BUCKET,
    storagePath,
    signedUploadToken: data.token
  };
}

export async function completeDirectDocumentUpload(input: DirectUploadCompleteInput) {
  const { uploadToken, checklistItem, documentPart } =
    await validateDirectUploadInput(input);
  const expectedPrefix = `${uploadToken.agency_id}/${uploadToken.student_id}/${checklistItem.id}/`;

  if (!input.storagePath.startsWith(expectedPrefix)) {
    throw new Error("Uploaded file path does not match this document request.");
  }

  const supabase = createSupabaseAdminClient();

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      agency_id: uploadToken.agency_id,
      student_id: uploadToken.student_id,
      checklist_item_id: checklistItem.id,
      document_part_id: documentPart?.id ?? null,
      upload_token_id: uploadToken.id,
      storage_bucket: STUDENT_DOCUMENTS_BUCKET,
      storage_path: input.storagePath,
      original_filename: input.filename,
      mime_type: input.mimeType || null,
      file_size_bytes: input.fileSizeBytes,
      status: "uploaded",
      scan_status: "not_scanned"
    })
    .select("id")
    .single();

  if (insertError || !document) {
    console.error("[upload-document] document insert failed", insertError);
    await supabase.storage.from(STUDENT_DOCUMENTS_BUCKET).remove([input.storagePath]);
    captureAppError(
      insertError || new Error("Document metadata insert returned no row."),
      {
        module: "upload",
        action: "document_metadata_insert",
        provider: "supabase",
        agencyId: uploadToken.agency_id,
        studentId: uploadToken.student_id
      }
    );
    throw new Error(insertError?.message || "Could not save uploaded document metadata.");
  }

  await updateChecklistProgress({
    agencyId: uploadToken.agency_id,
    checklistItem,
    documentPartId: documentPart?.id ?? null,
    status: "uploaded"
  });

  await supabase
    .from("upload_tokens")
    .update({
      used_count: Number(uploadToken.used_count ?? 0) + 1,
      last_used_at: new Date().toISOString()
    })
    .eq("id", uploadToken.id);

  await createAuditLog({
    agencyId: uploadToken.agency_id,
    tableName: "documents",
    recordId: document.id,
    action: "document_uploaded",
    metadata: {
      document_name: checklistItem.document_name,
      part_name: documentPart?.part_name ?? null,
      filename: input.filename,
      storage_bucket: STUDENT_DOCUMENTS_BUCKET,
      source: "upload_portal"
    }
  });

  let scanResult;

  try {
    scanResult = await scanUploadedDocumentFromUploadToken({
      documentId: document.id,
      agencyId: uploadToken.agency_id
    });
  } catch (scanError) {
    console.error("[upload-document] scan failed after upload", scanError);
    captureAppError(scanError, {
      module: "upload",
      action: "document_scan_after_upload",
      agencyId: uploadToken.agency_id,
      studentId: uploadToken.student_id,
      documentId: document.id
    });
    await supabase
      .from("documents")
      .update({
        status: "needs_review",
        scan_status: "scan_failed",
        scan_error_message:
          "Automatic scan failed. The counselor must review this upload."
      })
      .eq("agency_id", uploadToken.agency_id)
      .eq("id", document.id);
    await createAuditLog({
      agencyId: uploadToken.agency_id,
      tableName: "documents",
      recordId: document.id,
      action: "document_scan_failed",
      metadata: { source: "upload_portal" }
    });
    scanResult = {
      ok: false,
      documentId: document.id,
      studentId: uploadToken.student_id,
      scanStatus: "scan_failed",
      documentStatus: "needs_review",
      message:
        "Uploaded successfully. Automatic scan needs counselor review."
    };
  }

  const scanStatus =
    scanResult.ok && scanResult.scanStatus
      ? scanResult.scanStatus
      : "scan_failed";
  const documentStatus =
    scanResult.documentStatus || (scanResult.ok ? "uploaded" : "needs_review");

  await updateChecklistProgress({
    agencyId: uploadToken.agency_id,
    checklistItem,
    documentPartId: documentPart?.id ?? null,
    status: documentStatus
  });

  const scanMessage = studentScanMessage({
    ok: scanResult.ok,
    documentStatus,
    scanStatus
  });

  return {
    documentId: document.id as string,
    storagePath: input.storagePath,
    message: scanMessage,
    documentStatus,
    scanStatus,
    scanMessage
  };
}
