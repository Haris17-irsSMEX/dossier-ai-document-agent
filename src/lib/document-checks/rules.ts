import "server-only";

import { addMonths, isBefore, isValid, parse, parseISO } from "date-fns";

import type {
  DocumentCheckIssue,
  DocumentCheckResult
} from "@/lib/ai/document-check-schema";
import type { ChecklistStatus } from "@/lib/checklists/rules";

type RequiredPart = {
  id?: string;
  part_name: string;
  is_required: boolean;
};

type DocumentForItem = {
  id: string;
  document_part_id?: string | null;
  original_filename: string;
  mime_type?: string | null;
  status?: string | null;
};

type RuleInput = {
  studentName: string;
  documentName: string;
  acceptedFormats: string[];
  uploadType: string;
  requiredParts: RequiredPart[];
  documentsForItem: DocumentForItem[];
  currentDocument: DocumentForItem;
  currentPart?: RequiredPart | null;
  expiryValidationEnabled: boolean;
  ocrText: string;
  ocrConfidence?: number | null;
  aiResult?: DocumentCheckResult | null;
};

function issue(input: DocumentCheckIssue): DocumentCheckIssue {
  return input;
}

function extensionFor(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return extension === "jpeg" ? "jpg" : extension;
}

function normalizeFormats(formats: string[]) {
  return formats.map((format) => format.toLowerCase());
}

function isFormatAccepted(document: DocumentForItem, acceptedFormats: string[]) {
  const extension = extensionFor(document.original_filename);
  const normalized = normalizeFormats(acceptedFormats);

  if (normalized.includes(extension)) {
    return true;
  }

  const mime = document.mime_type?.toLowerCase() || "";
  const mimeByFormat: Record<string, string[]> = {
    pdf: ["application/pdf"],
    jpg: ["image/jpeg"],
    png: ["image/png"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
  };

  return normalized.some((format) => mimeByFormat[format]?.includes(mime));
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function namesMatch(studentName: string, extractedName?: string | null) {
  if (!extractedName) {
    return true;
  }

  const studentTokens = normalizeName(studentName);
  const extractedTokens = normalizeName(extractedName);

  if (!studentTokens.length || !extractedTokens.length) {
    return true;
  }

  const studentCompact = studentTokens.join("");
  const extractedCompact = extractedTokens.join("");

  if (
    studentCompact.includes(extractedCompact) ||
    extractedCompact.includes(studentCompact)
  ) {
    return true;
  }

  const overlap = extractedTokens.filter((token) =>
    studentTokens.includes(token)
  ).length;

  return overlap / Math.max(studentTokens.length, extractedTokens.length) >= 0.67;
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const iso = parseISO(trimmed);

  if (isValid(iso)) {
    return iso;
  }

  const formats = [
    "dd/MM/yyyy",
    "MM/dd/yyyy",
    "dd-MM-yyyy",
    "MM-dd-yyyy",
    "dd MMM yyyy",
    "MMM dd yyyy",
    "yyyy/MM/dd"
  ];

  for (const format of formats) {
    const parsed = parse(trimmed, format, new Date());

    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
}

function hasSeriousMismatch(issues: DocumentCheckIssue[]) {
  return issues.some(
    (item) =>
      item.severity === "high" &&
      ["name_mismatch", "suspicious", "wrong_document"].includes(item.type)
  );
}

export function runDocumentRules(input: RuleInput) {
  const issues: DocumentCheckIssue[] = [];
  const acceptedFormatList = input.acceptedFormats
    .map((format) => format.toUpperCase())
    .join(", ");

  if (!isFormatAccepted(input.currentDocument, input.acceptedFormats)) {
    issues.push(
      issue({
        type: "wrong_format",
        severity: "high",
        message: "The uploaded file format is not accepted for this request.",
        evidence: `${input.currentDocument.original_filename} is not one of ${acceptedFormatList}.`,
        recommended_action: `Ask the student to upload ${acceptedFormatList}.`
      })
    );
  }

  if (input.uploadType === "single" && input.documentsForItem.length > 1) {
    issues.push(
      issue({
        type: "missing_page",
        severity: "low",
        message: "This request expects one file, but multiple files were uploaded.",
        evidence: `${input.documentsForItem.length} files are attached to a single-upload request.`,
        recommended_action: "Review which upload should be kept for this checklist item."
      })
    );
  }

  if (input.uploadType === "multi_part") {
    const uploadedPartIds = new Set(
      input.documentsForItem
        .map((document) => document.document_part_id)
        .filter(Boolean)
    );
    const missingRequiredParts = input.requiredParts.filter(
      (part) => part.is_required && part.id && !uploadedPartIds.has(part.id)
    );

    for (const part of missingRequiredParts) {
      issues.push(
        issue({
          type: "missing_page",
          severity: "high",
          message: `${part.part_name} is required but has not been uploaded.`,
          evidence: `Required part missing for ${input.documentName}.`,
          recommended_action: `Ask the student to upload ${part.part_name}.`
        })
      );
    }
  }

  if (input.ocrText.trim().length < 40) {
    issues.push(
      issue({
        type: "low_confidence",
        severity: "high",
        message: "OCR could not read enough text from this document.",
        evidence: "Extracted text is very short or unreadable.",
        recommended_action:
          "Ask for a clearer scan or manually review the uploaded file."
      })
    );
  }

  if (typeof input.ocrConfidence === "number" && input.ocrConfidence < 0.55) {
    issues.push(
      issue({
        type: "low_confidence",
        severity: "medium",
        message: "OCR confidence is low.",
        evidence: `Azure OCR confidence was ${Math.round(input.ocrConfidence * 100)}%.`,
        recommended_action:
          "Manually review the file and request a clearer copy if needed."
      })
    );
  }

  const extractedFields = input.aiResult?.extracted_fields;

  if (!namesMatch(input.studentName, extractedFields?.full_name)) {
    issues.push(
      issue({
        type: "name_mismatch",
        severity: "high",
        message: "The extracted name does not match the student profile.",
        evidence: `Profile: ${input.studentName}; extracted: ${extractedFields?.full_name}.`,
        recommended_action:
          "Ask the consultant to confirm ownership before accepting this document."
      })
    );
  }

  if (input.expiryValidationEnabled) {
    const expiryDate = parseDate(extractedFields?.expiry_date);
    const today = new Date();

    if (expiryDate && isBefore(expiryDate, today)) {
      issues.push(
        issue({
          type: "expired",
          severity: "high",
          message: "The document appears to be expired.",
          evidence: `Extracted expiry date: ${extractedFields?.expiry_date}.`,
          recommended_action: "Ask the student to upload a valid current document."
        })
      );
    }

    if (
      expiryDate &&
      input.documentName.toLowerCase().includes("passport") &&
      isBefore(expiryDate, addMonths(today, 6))
    ) {
      issues.push(
        issue({
          type: "expired",
          severity: "high",
          message: "The passport appears to expire within six months.",
          evidence: `Extracted passport expiry date: ${extractedFields?.expiry_date}.`,
          recommended_action:
            "Ask the student to renew the passport or confirm destination rules."
        })
      );
    }
  }

  return issues;
}

export function resolveDocumentStatus(input: {
  ruleIssues: DocumentCheckIssue[];
  aiResult?: DocumentCheckResult | null;
  aiError?: string | null;
}): ChecklistStatus {
  const allIssues = [...input.ruleIssues, ...(input.aiResult?.issues ?? [])];

  if (hasSeriousMismatch(allIssues)) {
    return "suspicious";
  }

  if (allIssues.some((item) => item.type === "wrong_format")) {
    return "wrong_format";
  }

  if (allIssues.some((item) => item.type === "wrong_document")) {
    return "wrong_document";
  }

  if (allIssues.some((item) => item.type === "blurry")) {
    return "blurry";
  }

  if (allIssues.some((item) => item.type === "expired")) {
    return "expired";
  }

  if (allIssues.some((item) => item.type === "name_mismatch")) {
    return "name_mismatch";
  }

  if (input.aiResult?.recommended_status === "suspicious") {
    return "suspicious";
  }

  if (input.aiResult?.recommended_status === "official_verification_required") {
    return "official_verification_required";
  }

  if (
    input.aiError ||
    input.aiResult?.needs_human_review ||
    input.aiResult?.recommended_status === "needs_review" ||
    allIssues.length > 0
  ) {
    return "needs_review";
  }

  return "accepted";
}
