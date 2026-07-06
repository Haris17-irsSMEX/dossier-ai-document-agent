"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditLog } from "@/lib/actions/audit";
import { scanUploadedDocumentFromUploadToken } from "@/lib/actions/document-scans";
import { requireCurrentProfile } from "@/lib/actions/students";
import { checklistStatusSchema } from "@/lib/checklists/rules";
import {
  mapStorageBucketErrorMessage,
  STUDENT_DOCUMENTS_BUCKET
} from "@/lib/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { captureAppError } from "@/lib/monitoring/sentry";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const allowedMimeByFormat: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
};

export type StudentDocumentListItem = {
  id: string;
  student_id: string;
  checklist_item_id: string;
  document_part_id?: string | null;
  original_filename: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  status: string;
  scan_status?: string | null;
  scan_error_message?: string | null;
  created_at?: string | null;
  checklist_item?: {
    document_name?: string | null;
  } | null;
  document_part?: {
    part_name?: string | null;
  } | null;
  document_extractions?: Array<{
    id: string;
    raw_text?: string | null;
    confidence?: number | null;
    status?: string | null;
    error_message?: string | null;
    extracted_fields?: {
      ai_validation?: {
        detected_document_type?: string;
        confidence?: number;
        extracted_fields?: Record<string, string | null>;
      } | null;
      ocr_metadata?: Record<string, unknown>;
      ai_validation_error?: string | null;
    } | null;
    created_at?: string | null;
  }>;
  document_issues?: Array<{
    id: string;
    issue_type: string;
    severity: string;
    message: string;
    evidence?: string | null;
    recommended_action?: string | null;
    is_resolved?: boolean | null;
    created_at?: string | null;
  }>;
};

type UploadPortalDocumentPart = {
  id: string;
  part_name: string;
  is_required: boolean;
  status?: string | null;
};

type UploadPortalChecklistItem = {
  id: string;
  document_name: string;
  accepted_formats: string[];
  upload_type: string;
  document_parts?: UploadPortalDocumentPart[];
};

type CreatedDocument = {
  id: string;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function extensionFor(file: File) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (nameExtension === "jpeg") {
    return "jpg";
  }
  return nameExtension || "";
}

function isAllowedFile(file: File, acceptedFormats: string[]) {
  const extension = extensionFor(file);
  const normalized = acceptedFormats.map((format) => format.toLowerCase());
  const mimeOk = normalized.some((format) =>
    allowedMimeByFormat[format]?.includes(file.type)
  );

  return normalized.includes(extension) || mimeOk;
}

function redirectUploadError(token: string, message: string) {
  redirect(`/upload/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
}

function firstUploadedFile(formData: FormData) {
  const files = [
    ...formData.getAll("camera_file"),
    ...formData.getAll("file")
  ];

  return files.find(
    (value): value is File => value instanceof File && value.size > 0
  );
}

function studentFeedbackForStatus(input: {
  ok: boolean;
  documentStatus?: string;
  scanStatus?: string;
}) {
  if (!input.ok || input.scanStatus === "scan_failed") {
    return "Uploaded successfully. Automatic scan could not run, so the counselor will review this manually.";
  }

  switch (input.documentStatus) {
    case "accepted":
      return "Accepted: this file looks clear.";
    case "blurry":
      return "Please reupload: image is blurry.";
    case "wrong_document":
      return "Please reupload: this looks like the wrong document.";
    case "wrong_format":
      return "Please reupload: this file format is not accepted.";
    case "suspicious":
    case "name_mismatch":
    case "official_verification_required":
    case "needs_review":
    default:
      return "Needs counselor review: we could not confidently read this file.";
  }
}

export async function getUploadPortalData(token: string) {
  const supabase = createSupabaseAdminClient();
  const token_hash = hashToken(token);

  const { data: uploadToken, error } = await supabase
    .from("upload_tokens")
    .select("*, student:students(*)")
    .eq("token_hash", token_hash)
    .single();

  if (error || !uploadToken) {
    return { error: "Upload link is invalid." };
  }

  if (uploadToken.status !== "active" || new Date(uploadToken.expires_at) < new Date()) {
    return { error: "Upload link has expired." };
  }

  await writeAuditLog({
    agencyId: uploadToken.agency_id,
    tableName: "upload_tokens",
    recordId: uploadToken.id,
    action: "upload_link_opened",
    metadata: { student_id: uploadToken.student_id }
  });

  const { data: items, error: itemsError } = await supabase
    .from("checklist_items")
    .select("*, document_parts(*)")
    .eq("agency_id", uploadToken.agency_id)
    .eq("student_id", uploadToken.student_id)
    .eq("visible_to_student", true)
    .eq("is_requested", true)
    .eq("is_archived", false)
    .order("phase_order")
    .order("item_order")
    .order("created_at");

  if (itemsError) {
    return { error: itemsError.message };
  }

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select(
      "id, checklist_item_id, document_part_id, original_filename, status, scan_status, scan_error_message, created_at"
    )
    .eq("agency_id", uploadToken.agency_id)
    .eq("student_id", uploadToken.student_id)
    .order("created_at", { ascending: false });

  if (documentsError) {
    return { error: documentsError.message };
  }

  return {
    uploadToken,
    student: uploadToken.student,
    checklistItems: items ?? [],
    documents: documents ?? []
  };
}

export async function uploadStudentDocumentsAction(formData: FormData) {
  const parsed = z
    .object({
      token: z.string().min(20),
      checklist_item_id: z.string().uuid(),
      document_part_id: z.string().uuid().optional().or(z.literal(""))
    })
    .parse(Object.fromEntries(formData));
  const token = parsed.token;
  const portal = await getUploadPortalData(token);

  if ("error" in portal) {
    redirectUploadError(token, portal.error || "Upload failed.");
  }

  const supabase = createSupabaseAdminClient();
  const checklistItems = (portal.checklistItems ?? []) as UploadPortalChecklistItem[];
  const item = checklistItems.find((checklistItem) => checklistItem.id === parsed.checklist_item_id);
  const file = firstUploadedFile(formData);

  if (!item) {
    redirectUploadError(token, "Document request was not found.");
  }

  const checklistItem = item as UploadPortalChecklistItem;

  if (!(file instanceof File) || file.size <= 0) {
    redirectUploadError(token, "Choose one file to upload.");
  }

  const uploadFile = file as File;

  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    redirectUploadError(token, "File is too large. Upload a file up to 10 MB.");
  }

  const acceptedFormats = (checklistItem.accepted_formats as string[]) ?? [];

  if (!isAllowedFile(uploadFile, acceptedFormats)) {
    redirectUploadError(
      token,
      `${checklistItem.document_name} must be ${acceptedFormats.join(", ").toUpperCase()}.`
    );
  }

  const part =
    checklistItem.upload_type === "multi_part"
      ? (checklistItem.document_parts ?? []).find(
          (documentPart) => documentPart.id === parsed.document_part_id
        )
      : null;

  if (checklistItem.upload_type === "multi_part" && !part) {
    redirectUploadError(token, "Choose the document part you are uploading.");
  }

  const partPath = part ? `/${part.id}` : "";
  const path = `${portal.uploadToken.agency_id}/${portal.student.id}/${checklistItem.id}${partPath}/${crypto.randomUUID()}-${uploadFile.name}`;
  const { error: storageError } = await supabase.storage
    .from(STUDENT_DOCUMENTS_BUCKET)
    .upload(path, uploadFile, { upsert: false, contentType: uploadFile.type });

  if (storageError) {
    redirectUploadError(
      token,
      mapStorageBucketErrorMessage(storageError.message)
    );
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      agency_id: portal.uploadToken.agency_id,
      student_id: portal.student.id,
      checklist_item_id: checklistItem.id,
      document_part_id: part?.id ?? null,
      upload_token_id: portal.uploadToken.id,
      storage_bucket: STUDENT_DOCUMENTS_BUCKET,
      storage_path: path,
      original_filename: uploadFile.name,
      mime_type: uploadFile.type,
      file_size_bytes: uploadFile.size
    })
    .select("id")
    .single();

  if (insertError || !document) {
    redirectUploadError(token, insertError?.message || "Could not save uploaded document.");
  }

  const createdDocument = document as CreatedDocument;

  if (part) {
    await supabase
      .from("document_parts")
      .update({ status: "uploaded" })
      .eq("id", part.id);
  }

  const { data: itemDocuments } = await supabase
    .from("documents")
    .select("document_part_id")
    .eq("agency_id", portal.uploadToken.agency_id)
    .eq("checklist_item_id", checklistItem.id);
  const requiredParts = (checklistItem.document_parts ?? []).filter(
    (documentPart) => documentPart.is_required
  );
  const uploadedRequiredPartIds = new Set(
    (itemDocuments ?? [])
      .map((uploadedDocument) => uploadedDocument.document_part_id)
      .filter(Boolean)
  );
  const allRequiredPartsUploaded =
    checklistItem.upload_type !== "multi_part" ||
    requiredParts.every((documentPart) =>
      uploadedRequiredPartIds.has(documentPart.id)
    );

  await supabase
    .from("checklist_items")
    .update({ status: allRequiredPartsUploaded ? "uploaded" : "needs_review" })
    .eq("id", checklistItem.id);

  await supabase
    .from("upload_tokens")
    .update({
      used_count: portal.uploadToken.used_count + 1,
      last_used_at: new Date().toISOString()
    })
    .eq("id", portal.uploadToken.id);

  await writeAuditLog({
    agencyId: portal.uploadToken.agency_id,
    tableName: "documents",
    recordId: createdDocument.id,
    action: "document_uploaded",
    metadata: {
      document_name: checklistItem.document_name,
      part_name: part?.part_name ?? null,
      filename: uploadFile.name,
      source: "upload_portal"
    }
  });

  const scanResult = await scanUploadedDocumentFromUploadToken({
    documentId: createdDocument.id,
    agencyId: portal.uploadToken.agency_id
  });
  const feedback = studentFeedbackForStatus({
    ok: scanResult.ok,
    documentStatus: scanResult.documentStatus,
    scanStatus: scanResult.scanStatus
  });

  revalidatePath(`/students/${portal.student.id}/documents`);
  redirect(
    `/upload/${encodeURIComponent(token)}?success=${encodeURIComponent(feedback)}&documentId=${encodeURIComponent(createdDocument.id)}`
  );
}

export async function listStudentDocuments(
  studentId: string
): Promise<StudentDocumentListItem[]> {
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      [
        "*",
        "checklist_item:checklist_items(document_name)",
        "document_part:document_parts(part_name)",
        "document_extractions(*)",
        "document_issues(*)"
      ].join(", ")
    )
    .eq("agency_id", profile.agency_id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    captureAppError(error, {
      module: "documents",
      action: "document_list",
      agencyId: profile.agency_id,
      studentId
    });
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as StudentDocumentListItem[];
}

export async function updateDocumentStatusAction(formData: FormData) {
  const parsed = z
    .object({
      id: z.string().uuid(),
      student_id: z.string().uuid(),
      status: checklistStatusSchema
    })
    .parse(Object.fromEntries(formData));
  const profile = await requireCurrentProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("documents")
    .update({
      status: parsed.status,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("agency_id", profile.agency_id)
    .eq("id", parsed.id);

  if (error) {
    captureAppError(error, {
      module: "documents",
      action: "document_status_update",
      agencyId: profile.agency_id,
      studentId: parsed.student_id,
      documentId: parsed.id
    });
    throw new Error(error.message);
  }

  await writeAuditLog({
    agencyId: profile.agency_id,
    actorProfileId: profile.id,
    tableName: "documents",
    recordId: parsed.id,
    action: "document_status_changed",
    newData: { status: parsed.status }
  });

  revalidatePath(`/students/${parsed.student_id}/documents`);
}
