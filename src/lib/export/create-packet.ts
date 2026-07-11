import "server-only";

import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { writeAuditLog } from "@/lib/actions/audit";
import { CHECKLIST_PHASES, getChecklistPhase } from "@/lib/checklists/phases";
import {
  isActiveChecklistRequest,
  isChecklistReady,
  isMissingActiveRequest,
  isRequested,
  requirementLevel,
  summarizeChecklist
} from "@/lib/checklists/request-logic";
import { STUDENT_DOCUMENTS_BUCKET, mapStorageBucketErrorMessage } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ExportPacketOptions = {
  includeAcceptedOnly: boolean;
  includeUploadedAndNeedsReview: boolean;
  excludeRejected: boolean;
  includeVerificationReport: boolean;
  includeScanIssueReport: boolean;
  includeProfileSummaryPdf: boolean;
};

export const defaultExportPacketOptions: ExportPacketOptions = {
  includeAcceptedOnly: false,
  includeUploadedAndNeedsReview: true,
  excludeRejected: true,
  includeVerificationReport: true,
  includeScanIssueReport: true,
  includeProfileSummaryPdf: true
};

type JsonRecord = Record<string, unknown>;

export type ExportStudent = {
  id: string;
  agency_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  target_country?: string | null;
  destination_country?: string | null;
  intake?: string | null;
  program_level?: string | null;
  education_background?: string | null;
  sponsor_type?: string | null;
  deadline_date?: string | null;
};

export type ExportChecklistItem = {
  id: string;
  document_name: string;
  category: string;
  phase_slug?: string | null;
  phase_label?: string | null;
  phase_order?: number | null;
  requirement_level?: string | null;
  is_required: boolean;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  applies_from_stage?: string | null;
  is_archived?: boolean | null;
  status: string;
  submission_deadline?: string | null;
  document_parts?: Array<{
    id: string;
    part_name: string;
    is_required: boolean;
    status?: string | null;
  }>;
};

export type ExportDocument = {
  id: string;
  storage_bucket?: string | null;
  storage_path: string;
  original_filename: string;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  status: string;
  scan_status?: string | null;
  scan_error_message?: string | null;
  checklist_item?: {
    id?: string | null;
    document_name?: string | null;
    status?: string | null;
    phase_slug?: string | null;
    phase_label?: string | null;
  } | null;
  document_part?: {
    id?: string | null;
    part_name?: string | null;
  } | null;
  document_extractions?: Array<{
    id: string;
    provider?: string | null;
    confidence?: number | null;
    status?: string | null;
    error_message?: string | null;
    extracted_fields?: JsonRecord | null;
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

export type ExportVerificationRequest = {
  id: string;
  status: string;
  portal_reference?: string | null;
  instructions?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  provider?: {
    name?: string | null;
    code?: string | null;
    provider_type?: string | null;
  } | null;
};

export type ExportVerificationResult = {
  id: string;
  verification_request_id: string;
  status: string;
  notes?: string | null;
  verified_at?: string | null;
};

export type ExportPacketPreview = {
  student: ExportStudent;
  checklistItems: ExportChecklistItem[];
  documents: ExportDocument[];
  verificationRequests: ExportVerificationRequest[];
  verificationResults: ExportVerificationResult[];
  completion: {
    total: number;
    complete: number;
    missingRequired: number;
    problemDocuments: number;
    percent: number;
  };
};

export type ExportPacketResult = {
  exportPacketId: string;
  fileName: string;
  base64: string;
  includedDocumentsCount: number;
  unavailableFiles: Array<{ documentId: string; fileName: string; reason: string }>;
};

function cleanText(value?: string | number | null) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  return String(value).replace(/[^\x20-\x7E]/g, "?");
}

function slug(value?: string | null) {
  return cleanText(value)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "file";
}

function fileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && extension !== fileName.toLowerCase() ? extension : "bin";
}

function uniqueName(baseName: string, usedNames: Set<string>) {
  let candidate = baseName;
  let index = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    const dotIndex = baseName.lastIndexOf(".");
    candidate =
      dotIndex > 0
        ? `${baseName.slice(0, dotIndex)}_${index}${baseName.slice(dotIndex)}`
        : `${baseName}_${index}`;
    index += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function documentExportName(student: ExportStudent, document: ExportDocument) {
  const extension = fileExtension(document.original_filename);
  const parts = [
    slug(student.full_name),
    slug(document.checklist_item?.document_name || "Document"),
    document.document_part?.part_name ? slug(document.document_part.part_name) : null,
    slug(document.status || "uploaded")
  ].filter(Boolean);

  return `${parts.join("_")}.${extension}`;
}

function isProblemStatus(status?: string | null, scanStatus?: string | null) {
  return [
    "wrong_format",
    "wrong_document",
    "blurry",
    "expired",
    "name_mismatch",
    "needs_review",
    "suspicious",
    "rejected",
    "official_verification_required",
    "scan_failed"
  ].includes(status || scanStatus || "");
}

function shouldIncludeDocument(document: ExportDocument, options: ExportPacketOptions) {
  if (options.excludeRejected && document.status === "rejected") {
    return false;
  }

  if (options.includeAcceptedOnly) {
    return ["accepted", "officially_verified"].includes(document.status);
  }

  if (!options.includeUploadedAndNeedsReview) {
    return ["accepted", "officially_verified"].includes(document.status);
  }

  return !["missing", "rejected"].includes(document.status);
}

function wrapText(text: string, maxLength = 88) {
  const words = cleanText(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxLength) {
      if (line) {
        lines.push(line);
      }
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : ["-"];
}

async function createSummaryPdf(preview: ExportPacketPreview) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 744;

  function addPageIfNeeded(height = 24) {
    if (y < 56 + height) {
      page = pdf.addPage([612, 792]);
      y = 744;
    }
  }

  function drawLine(text: string, size = 10, isBold = false) {
    for (const line of wrapText(text, size >= 13 ? 70 : 92)) {
      addPageIfNeeded(size + 8);
      page.drawText(cleanText(line), {
        x: 48,
        y,
        size,
        font: isBold ? bold : regular,
        color: rgb(0.08, 0.15, 0.13)
      });
      y -= size + 7;
    }
  }

  function section(title: string) {
    y -= 10;
    drawLine(title, 14, true);
    y -= 4;
  }

  drawLine("Student Application Packet", 18, true);
  drawLine(`Exported: ${formatDateTime(new Date()) || new Date().toISOString()}`, 10);

  section("Student Details");
  drawLine(`Name: ${preview.student.full_name}`);
  drawLine(`Email: ${preview.student.email || "-"}`);
  drawLine(`Phone: ${preview.student.phone || "-"}`);
  drawLine(`Target country: ${preview.student.target_country || preview.student.destination_country || "-"}`);
  drawLine(`Intake: ${preview.student.intake || "-"}`);
  drawLine(`Program level: ${preview.student.program_level || "-"}`);
  drawLine(`Deadline: ${formatDateTime(preview.student.deadline_date) || preview.student.deadline_date || "-"}`);

  section("Checklist Summary");
  drawLine(
    `Completion: ${preview.completion.complete}/${preview.completion.total} (${preview.completion.percent}%)`
  );
  drawLine(`Missing active requests: ${preview.completion.missingRequired}`);
  drawLine(`Problem documents: ${preview.completion.problemDocuments}`);
  CHECKLIST_PHASES.forEach((phase) => {
    const phaseItems = preview.checklistItems.filter(
      (item) => getChecklistPhase(item.phase_slug).slug === phase.slug
    );

    if (!phaseItems.length) {
      return;
    }

    drawLine(phase.label, 11, true);
    phaseItems.forEach((item) => {
      drawLine(
        `${item.document_name} - ${isRequested(item) ? item.status : "not requested"} - ${requirementLevel(item)}`
      );
    });
  });

  section("Uploaded Documents");
  preview.documents.forEach((document) => {
    drawLine(
      `${document.checklist_item?.document_name || "Document"}${document.document_part?.part_name ? ` / ${document.document_part.part_name}` : ""} - ${document.status} - ${document.original_filename}`
    );
  });

  const issues = preview.documents.flatMap((document) =>
    (document.document_issues ?? []).map((issue) => ({ document, issue }))
  );

  section("Scan/AI Issue Summary");
  if (issues.length) {
    issues.forEach(({ document, issue }) => {
      drawLine(
        `${document.checklist_item?.document_name || document.original_filename}: ${issue.severity} ${issue.issue_type} - ${issue.message}`
      );
    });
  } else {
    drawLine("No open scan issues recorded.");
  }

  section("Official Verification Summary");
  if (preview.verificationRequests.length) {
    preview.verificationRequests.forEach((request) => {
      drawLine(
        `${request.provider?.name || "Provider"} - ${request.status}${request.portal_reference ? ` - Ref ${request.portal_reference}` : ""}`
      );
    });
  } else {
    drawLine("No verification workflow records found.");
  }

  return pdf.save();
}

function buildVerificationReport(preview: ExportPacketPreview) {
  return {
    generated_at: new Date().toISOString(),
    student_id: preview.student.id,
    verification_requests: preview.verificationRequests,
    verification_results: preview.verificationResults
  };
}

function buildScanIssueReport(
  preview: ExportPacketPreview,
  unavailableFiles: Array<{ documentId: string; fileName: string; reason: string }>
) {
  return {
    generated_at: new Date().toISOString(),
    student_id: preview.student.id,
    unavailable_files: unavailableFiles,
    documents: preview.documents.map((document) => ({
      id: document.id,
      document_name: document.checklist_item?.document_name,
      phase: document.checklist_item?.phase_label,
      part_name: document.document_part?.part_name,
      file_name: document.original_filename,
      status: document.status,
      scan_status: document.scan_status,
      scan_error_message: document.scan_error_message,
      extractions: document.document_extractions ?? [],
      issues: document.document_issues ?? []
    }))
  };
}

export async function getExportPacketPreview(studentId: string): Promise<ExportPacketPreview> {
  const supabase = await createSupabaseServerClient();

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .single();

  if (studentError || !student) {
    throw new Error(studentError?.message || "Student was not found.");
  }

  const [
    { data: checklistItems, error: checklistError },
    { data: documents, error: documentsError },
    { data: verificationRequests, error: verificationError },
    { data: verificationResults, error: verificationResultsError }
  ] = await Promise.all([
    supabase
      .from("checklist_items")
      .select("*, document_parts(*)")
      .eq("student_id", studentId)
      .eq("is_archived", false)
      .order("phase_order")
      .order("item_order")
      .order("created_at"),
    supabase
      .from("documents")
      .select(
        [
          "*",
          "checklist_item:checklist_items(id, document_name, status, phase_slug, phase_label)",
          "document_part:document_parts(id, part_name)",
          "document_extractions(*)",
          "document_issues(*)"
        ].join(", ")
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("verification_requests")
      .select("*, provider:verification_providers(name, code, provider_type)")
      .eq("student_id", studentId)
      .order("created_at"),
    supabase
      .from("verification_results")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at")
  ]);

  if (checklistError) {
    throw new Error(checklistError.message);
  }

  if (documentsError) {
    throw new Error(documentsError.message);
  }

  if (verificationError) {
    throw new Error(verificationError.message);
  }

  if (verificationResultsError) {
    throw new Error(verificationResultsError.message);
  }

  const allItems = (checklistItems ?? []) as ExportChecklistItem[];
  const requestedItems = allItems.filter(isActiveChecklistRequest);
  const requestedItemIds = new Set(requestedItems.map((item) => item.id));
  const docs = ((documents ?? []) as unknown as ExportDocument[]).filter((document) =>
    document.checklist_item?.id ? requestedItemIds.has(document.checklist_item.id) : false
  );
  const summary = summarizeChecklist(requestedItems);
  const complete = requestedItems.filter(isChecklistReady).length;
  const missingRequired = requestedItems.filter(isMissingActiveRequest).length;
  const problemDocuments = docs.filter((document) =>
    isProblemStatus(document.status, document.scan_status)
  ).length;

  return {
    student: student as ExportStudent,
    checklistItems: requestedItems,
    documents: docs,
    verificationRequests: (verificationRequests ?? []) as unknown as ExportVerificationRequest[],
    verificationResults: (verificationResults ?? []) as ExportVerificationResult[],
    completion: {
      total: summary.active.length,
      complete,
      missingRequired,
      problemDocuments,
      percent: summary.active.length
        ? Math.round((complete / summary.active.length) * 100)
        : 0
    }
  };
}

export async function createApplicationPacket(input: {
  studentId: string;
  agencyId: string;
  createdBy: string;
  options: ExportPacketOptions;
}): Promise<ExportPacketResult> {
  const options = { ...defaultExportPacketOptions, ...input.options };
  const preview = await getExportPacketPreview(input.studentId);

  if (preview.student.agency_id !== input.agencyId) {
    throw new Error("You can only export students from your own agency.");
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const includedDocuments = preview.documents.filter((document) =>
    shouldIncludeDocument(document, options)
  );
  const unavailableFiles: Array<{ documentId: string; fileName: string; reason: string }> = [];

  if (options.includeProfileSummaryPdf) {
    const pdfBytes = await createSummaryPdf(preview);
    zip.file("Student_Profile_Summary.pdf", pdfBytes);
  }

  const admin = createSupabaseAdminClient();

  for (const document of includedDocuments) {
    const bucket = document.storage_bucket || STUDENT_DOCUMENTS_BUCKET;
    const { data, error } = await admin.storage
      .from(bucket)
      .download(document.storage_path);

    if (error || !data) {
      unavailableFiles.push({
        documentId: document.id,
        fileName: document.original_filename,
        reason: mapStorageBucketErrorMessage(error?.message, bucket)
      });
      continue;
    }

    const arrayBuffer = await data.arrayBuffer();
    const fileName = uniqueName(documentExportName(preview.student, document), usedNames);
    zip.file(`Documents/${fileName}`, arrayBuffer);
  }

  if (options.includeVerificationReport) {
    zip.file(
      "Verification_Report.json",
      JSON.stringify(buildVerificationReport(preview), null, 2)
    );
  }

  if (options.includeScanIssueReport) {
    zip.file(
      "Scan_Issues_Report.json",
      JSON.stringify(buildScanIssueReport(preview, unavailableFiles), null, 2)
    );
  }

  if (unavailableFiles.length) {
    zip.file(
      "Missing_Files_Report.json",
      JSON.stringify(unavailableFiles, null, 2)
    );
  }

  const generatedAt = new Date().toISOString();
  const fileName = `${slug(preview.student.full_name)}_Application_Packet_${generatedAt.slice(0, 10)}.zip`;
  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const supabase = await createSupabaseServerClient();
  const { data: exportPacket, error: exportError } = await supabase
    .from("export_packets")
    .insert({
      agency_id: input.agencyId,
      student_id: input.studentId,
      created_by: input.createdBy,
      status: "ready",
      format: "zip",
      file_name: fileName,
      included_documents_count:
        includedDocuments.length - unavailableFiles.length,
      options,
      included_document_ids: includedDocuments.map((document) => document.id),
      metadata: {
        file_name: fileName,
        included_documents_count: includedDocuments.length - unavailableFiles.length,
        requested_documents_count: includedDocuments.length,
        unavailable_files: unavailableFiles,
        options,
        generated_at: generatedAt
      },
      completed_at: generatedAt
    })
    .select("id")
    .single();

  if (exportError || !exportPacket) {
    throw new Error(exportError?.message || "Could not save export metadata.");
  }

  await writeAuditLog({
    agencyId: input.agencyId,
    actorProfileId: input.createdBy,
    tableName: "export_packets",
    recordId: exportPacket.id,
    action: "export_generated",
    metadata: {
      file_name: fileName,
      included_documents_count: includedDocuments.length - unavailableFiles.length,
      unavailable_files_count: unavailableFiles.length,
      options
    }
  });

  return {
    exportPacketId: exportPacket.id,
    fileName,
    base64: Buffer.from(zipBytes).toString("base64"),
    includedDocumentsCount: includedDocuments.length - unavailableFiles.length,
    unavailableFiles
  };
}
