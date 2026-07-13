import type {
  ChecklistItem,
  UploadedDocument,
  UploadResponse,
  UploadStep
} from "./types";
import { mapStorageBucketErrorMessage } from "@/lib/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const UPLOAD_REQUEST_TIMEOUT_MS = 90_000;

type UploadPrepareResponse =
  | {
      ok: true;
      bucket: string;
      storagePath: string;
      signedUploadToken: string;
    }
  | {
      ok: false;
      error: string;
    };

function syntheticResponse(status: number) {
  return new Response(null, { status, statusText: status >= 400 ? "Error" : "OK" });
}

async function postUploadJson<T>(
  path: string,
  payload: Record<string, unknown>,
  signal: AbortSignal
) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal
  });

  try {
    return {
      response,
      result: (await response.json()) as T
    };
  } catch {
    return {
      response,
      result: {
        ok: false,
        error: `Upload service returned HTTP ${response.status}. Please try again.`
      } as T
    };
  }
}

export async function uploadDocumentRequest(formData: FormData) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    UPLOAD_REQUEST_TIMEOUT_MS
  );

  try {
    const file = formData.get("file");
    const token = String(formData.get("token") || "");
    const checklistItemId = String(formData.get("checklistItemId") || "");
    const documentPartId = String(formData.get("documentPartId") || "");

    if (!(file instanceof File) || file.size <= 0) {
      return {
        response: syntheticResponse(400),
        result: { ok: false, error: "Choose one file to upload." } as UploadResponse
      };
    }

    const metadata = {
      token,
      checklistItemId,
      documentPartId: documentPartId || undefined,
      filename: file.name,
      mimeType: file.type || "",
      fileSizeBytes: file.size
    };

    const prepared = await postUploadJson<UploadPrepareResponse>(
      "/api/upload-document/prepare",
      metadata,
      controller.signal
    );

    if (!prepared.response.ok || !prepared.result.ok) {
      return {
        response: prepared.response,
        result: prepared.result as UploadResponse
      };
    }

    const supabase = createSupabaseBrowserClient();
    const { error: storageError } = await supabase.storage
      .from(prepared.result.bucket)
      .uploadToSignedUrl(
        prepared.result.storagePath,
        prepared.result.signedUploadToken,
        file,
        {
          contentType: file.type || "application/octet-stream",
          upsert: false
        }
      );

    if (storageError) {
      return {
        response: syntheticResponse(500),
        result: {
          ok: false,
          error: mapStorageBucketErrorMessage(storageError.message)
        } as UploadResponse
      };
    }

    const completed = await postUploadJson<UploadResponse>(
      "/api/upload-document/complete",
      {
        ...metadata,
        storagePath: prepared.result.storagePath
      },
      controller.signal
    );

    return completed;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Upload is taking longer than expected. Refresh to check whether it saved before trying again."
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function formatList(values: string[]) {
  return values.map((value) => value.toUpperCase()).join(", ");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function acceptValue(formats: string[]) {
  return formats.map((format) => `.${format}`).join(",");
}

export function supportsCamera(formats: string[]) {
  return formats.some((format) =>
    ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(
      format.toLowerCase()
    )
  );
}

export function nativeCaptureAcceptValue(formats: string[]) {
  const normalized = formats.map((format) => format.toLowerCase());
  const values = new Set<string>();

  if (supportsCamera(formats)) {
    values.add("image/*");
  }

  for (const format of normalized) {
    if (["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(format)) {
      continue;
    }

    values.add(`.${format}`);
  }

  return [...values].join(",") || "image/*,.pdf,.doc,.docx";
}

function requirementLevel(item: ChecklistItem) {
  return item.requirement_level || (item.is_required === false ? "optional" : "required");
}

export function studentDocumentRequirementLabel(item: ChecklistItem) {
  const level = requirementLevel(item);

  if (level === "required") {
    return "Required";
  }

  if (item.is_requested !== false) {
    return "Requested";
  }

  return level === "optional" ? "Optional" : "Conditional";
}

export function studentDocumentRequirementTone(item: ChecklistItem) {
  const level = requirementLevel(item);

  if (level === "required") {
    return "danger";
  }

  if (item.is_requested !== false) {
    return "warning";
  }

  return level === "conditional" ? "warning" : "";
}

export function studentDocumentRequestHint(item: ChecklistItem) {
  const level = requirementLevel(item);

  if (item.is_requested !== false && level !== "required") {
    return "Your consultant requested this for your case.";
  }

  return null;
}

export function studentStepRequirementLabel(item: ChecklistItem, step: UploadStep) {
  if (item.upload_type === "multi_part" && step.part) {
    return step.isRequired ? "Required" : "Optional";
  }

  return studentDocumentRequirementLabel(item);
}

export function isIdentityDocument(item: ChecklistItem) {
  const name = item.document_name.toLowerCase();
  const identityTerms = [
    "cnic",
    "passport",
    "sponsor cnic",
    "id card",
    "identity card",
    "national id",
    "residence card",
    "resident card"
  ];

  return identityTerms.some((term) => name.includes(term));
}

export function requiresStudentDecision(
  status?: string | null,
  scanStatus?: string | null
) {
  return (
    status === "blurry" ||
    status === "wrong_document" ||
    status === "needs_review" ||
    status === "suspicious" ||
    scanStatus === "scan_failed"
  );
}

export function extensionFor(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return extension === "jpeg" ? "jpg" : extension;
}

export function isAcceptedClientFile(file: File, formats: string[]) {
  const normalized = formats.map((format) =>
    format.toLowerCase() === "jpeg" ? "jpg" : format.toLowerCase()
  );
  const extension = extensionFor(file.name);
  const mimeType = file.type.toLowerCase();
  const acceptsImages = normalized.some((format) =>
    ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(format)
  );
  const looksLikeImage =
    mimeType.startsWith("image/") ||
    ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(extension);
  const mimeByFormat: Record<string, string[]> = {
    doc: ["application/msword"],
    pdf: ["application/pdf"],
    jpg: ["image/jpeg"],
    heic: ["image/heic", "image/heif"],
    heif: ["image/heif", "image/heic"],
    png: ["image/png"],
    webp: ["image/webp"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
  };

  return (
    normalized.includes(extension) ||
    normalized.some((format) => mimeByFormat[format]?.includes(mimeType)) ||
    (acceptsImages && looksLikeImage)
  );
}

export function canPreviewClientFile(file: File) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
    file.type.toLowerCase()
  );
}

export function documentsForItem(
  documents: UploadedDocument[],
  itemId: string
) {
  return documents.filter((document) => document.checklist_item_id === itemId);
}

export function documentsForStep(
  documents: UploadedDocument[],
  item: ChecklistItem,
  step: UploadStep
) {
  return documents.filter((document) => {
    if (document.checklist_item_id !== item.id) {
      return false;
    }

    if (step.part) {
      return document.document_part_id === step.part.id;
    }

    return !document.document_part_id;
  });
}

export function newestDocument(documents: UploadedDocument[]) {
  return [...documents].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  })[0];
}

export function buildUploadSteps(item: ChecklistItem): UploadStep[] {
  if (item.upload_type === "multi_part") {
    return [...(item.document_parts ?? [])]
      .sort((a, b) => {
        const orderA = a.sort_order ?? 0;
        const orderB = b.sort_order ?? 0;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.part_name.localeCompare(b.part_name);
      })
      .map((part) => ({
        id: part.id,
        label: part.part_name,
        isRequired: part.is_required,
        part
      }));
  }

  return [
    {
      id: `${item.id}-file`,
      label: item.upload_type === "multiple" ? "Add file" : item.document_name,
      isRequired: item.is_requested !== false
    }
  ];
}

export function isProblemDocument(document?: UploadedDocument) {
  return [
    "needs_review",
    "blurry",
    "wrong_document",
    "suspicious",
    "scan_failed"
  ].includes(document?.status || document?.scan_status || "");
}

export function statusTone(status?: string | null) {
  switch (status) {
    case "accepted":
    case "uploaded":
    case "document_complete":
    case "scan_complete":
      return "success";
    case "blurry":
    case "wrong_document":
    case "suspicious":
    case "scan_failed":
    case "needs_retake":
      return "danger";
    case "needs_review":
    case "in_progress":
    case "uploading":
    case "scanning":
      return "warning";
    default:
      return "info";
  }
}

export function documentProgress(item: ChecklistItem, documents: UploadedDocument[]) {
  const itemDocuments = documentsForItem(documents, item.id);
  const steps = buildUploadSteps(item);
  const requiredSteps = steps.filter((step) => step.isRequired);
  const requiredTotal =
    item.upload_type === "multiple" ? 1 : Math.max(requiredSteps.length, 1);
  const uploadedRequired =
    item.upload_type === "multiple"
      ? itemDocuments.length > 0
        ? 1
        : 0
      : requiredSteps.filter(
          (step) => documentsForStep(documents, item, step).length > 0
        ).length;
  const missingCount = Math.max(requiredTotal - uploadedRequired, 0);
  const hasAnyUpload = itemDocuments.length > 0;
  const latestProblem = itemDocuments.find(isProblemDocument);
  const allRequiredAccepted =
    missingCount === 0 &&
    requiredSteps.length > 0 &&
    requiredSteps.every((step) => {
      const latest = newestDocument(documentsForStep(documents, item, step));
      return latest?.status === "accepted";
    });
  const status = latestProblem
    ? "Needs review"
    : allRequiredAccepted
      ? "Accepted"
      : missingCount === 0 && hasAnyUpload
        ? "Uploaded"
        : hasAnyUpload
          ? "In progress"
          : "Not started";

  return {
    status,
    missingCount,
    uploadedRequired,
    requiredTotal,
    hasAnyUpload,
    isComplete: missingCount === 0 && hasAnyUpload
  };
}

export function feedbackForDocument(document?: UploadedDocument) {
  if (!document) {
    return null;
  }

  if (document.status === "accepted") {
    return "Looks clear.";
  }

  if (document.status === "blurry") {
    return "Please retake. The image looks blurry.";
  }

  if (document.status === "wrong_document") {
    return "This may be the wrong document.";
  }

  if (document.status === "suspicious") {
    return "Needs counselor review.";
  }

  if (document.scan_status === "scan_failed") {
    return "Uploaded successfully. Automatic scan needs counselor review.";
  }

  if (document.status === "needs_review") {
    return "Needs counselor review.";
  }

  return "Uploaded successfully.";
}
