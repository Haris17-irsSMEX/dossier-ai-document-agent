import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { scanUploadedDocumentFromUploadToken } from "@/lib/actions/document-scans";
import { createAuditLog } from "@/lib/actions/audit";
import {
  mapStorageBucketErrorMessage,
  STUDENT_DOCUMENTS_BUCKET
} from "@/lib/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { captureAppError } from "@/lib/monitoring/sentry";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const allowedMimeByFormat: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
};

const uploadRequestSchema = z.object({
  token: z.string().min(20),
  checklistItemId: z.string().uuid(),
  documentPartId: z.string().uuid().optional()
});

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

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function extensionFor(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return extension === "jpeg" ? "jpg" : extension;
}

function isAllowedFile(file: File, acceptedFormats: string[]) {
  const normalizedFormats = acceptedFormats.map((format) =>
    format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase()
  );
  const extension = extensionFor(file.name);
  const normalizedMimeType = file.type.toLowerCase();
  const mimeOk = normalizedFormats.some((format) =>
    allowedMimeByFormat[format]?.includes(normalizedMimeType)
  );

  return normalizedFormats.includes(extension) || mimeOk;
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

  console.info("[upload-document] validating token");

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
    throw new Error("Uploaded file saved, but checklist status could not update.");
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsed = uploadRequestSchema.safeParse({
      token: formData.get("token"),
      checklistItemId: formData.get("checklistItemId"),
      documentPartId: formData.get("documentPartId") || undefined
    });

    if (!parsed.success) {
      return jsonError("Upload request is missing required details.");
    }

    const file = formData.get("file");

    console.info("[upload-document] file received", {
      hasFile: file instanceof File,
      size: file instanceof File ? file.size : null,
      type: file instanceof File ? file.type : null
    });

    if (!(file instanceof File) || file.size <= 0) {
      return jsonError("Choose one file to upload.");
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError("File is too large. Upload a file up to 10 MB.");
    }

    const uploadToken = await loadUploadToken(parsed.data.token);

    if (!uploadToken) {
      return jsonError("Upload link is invalid.", 404);
    }

    if (
      uploadToken.status !== "active" ||
      new Date(uploadToken.expires_at) < new Date()
    ) {
      return jsonError("Upload link has expired.", 403);
    }

    if (
      uploadToken.checklist_item_id &&
      uploadToken.checklist_item_id !== parsed.data.checklistItemId
    ) {
      return jsonError("This upload link is not valid for that document request.", 403);
    }

    const checklistItem = await loadChecklistItem({
      uploadToken,
      checklistItemId: parsed.data.checklistItemId
    });

    if (!checklistItem) {
      return jsonError("Document request was not found.", 404);
    }

    const acceptedFormats = checklistItem.accepted_formats ?? [];

    if (!isAllowedFile(file, acceptedFormats)) {
      return jsonError(
        `${checklistItem.document_name} must be ${acceptedFormats
          .join(", ")
          .toUpperCase()}.`
      );
    }

    const parts = checklistItem.document_parts ?? [];
    const documentPart = parsed.data.documentPartId
      ? parts.find((part) => part.id === parsed.data.documentPartId)
      : null;

    if (parsed.data.documentPartId && !documentPart) {
      return jsonError("Document part was not found for this request.", 404);
    }

    if (checklistItem.upload_type === "multi_part" && !documentPart) {
      return jsonError("Choose the document part you are uploading.");
    }

    if (checklistItem.upload_type !== "multi_part" && documentPart) {
      return jsonError("This document request does not accept document parts.");
    }

    const safeFilename = sanitizeFilename(file.name);
    const storagePath = [
      uploadToken.agency_id,
      uploadToken.student_id,
      checklistItem.id,
      `${Date.now()}-${safeFilename}`
    ].join("/");
    const supabase = createSupabaseAdminClient();
    const fileBytes = Buffer.from(await file.arrayBuffer());

    console.info("[upload-document] uploading to storage", {
      bucket: STUDENT_DOCUMENTS_BUCKET,
      storagePath,
      size: file.size
    });

    const { error: storageError } = await supabase.storage
      .from(STUDENT_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBytes, {
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (storageError) {
      console.error("[upload-document] storage upload failed", storageError);
      captureAppError(storageError, {
        module: "upload",
        action: "storage_upload",
        provider: "supabase",
        agencyId: uploadToken.agency_id,
        studentId: uploadToken.student_id,
        extra: { fileSize: file.size, mimeType: file.type }
      });
      return jsonError(mapStorageBucketErrorMessage(storageError.message), 500);
    }

    console.info("[upload-document] inserting document row");

    const { data: document, error: insertError } = await supabase
      .from("documents")
      .insert({
        agency_id: uploadToken.agency_id,
        student_id: uploadToken.student_id,
        checklist_item_id: checklistItem.id,
        document_part_id: documentPart?.id ?? null,
        upload_token_id: uploadToken.id,
        storage_bucket: STUDENT_DOCUMENTS_BUCKET,
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        status: "uploaded",
        scan_status: "not_scanned"
      })
      .select("id")
      .single();

    if (insertError || !document) {
      console.error("[upload-document] document insert failed", insertError);
      await supabase.storage.from(STUDENT_DOCUMENTS_BUCKET).remove([storagePath]);
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
      return jsonError(
        insertError?.message || "Could not save uploaded document metadata.",
        500
      );
    }

    console.info("[upload-document] document row inserted", {
      documentId: document.id,
      storagePath
    });

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
        filename: file.name,
        storage_bucket: STUDENT_DOCUMENTS_BUCKET,
        source: "upload_portal"
      }
    });

    console.info("[upload-document] starting scan", {
      documentId: document.id
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

    console.info("[upload-document] scan completed", {
      documentId: document.id,
      ok: scanResult.ok,
      scanStatus,
      documentStatus
    });

    return NextResponse.json({
      ok: true,
      documentId: document.id,
      storagePath,
      message: scanMessage,
      documentStatus,
      scanStatus,
      scanMessage
    });
  } catch (error) {
    console.error("[upload-document] unexpected upload failure", error);
    captureAppError(error, {
      module: "upload",
      action: "upload_document_route"
    });

    return jsonError(
      error instanceof Error ? error.message : "Upload failed. Please try again.",
      500
    );
  }
}
