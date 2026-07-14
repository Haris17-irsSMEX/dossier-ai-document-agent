import Link from "next/link";

import { DocumentIssuesList } from "@/components/documents/document-issues-list";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import {
  DocumentUploadsViewer,
  type DocumentViewerUpload
} from "@/components/documents/document-uploads-viewer";
import { ExtractionView } from "@/components/documents/extraction-view";
import { ScanDocumentButton } from "@/components/documents/scan-document-button";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import {
  listRequestedChecklistItems
} from "@/lib/actions/checklists";
import {
  listStudentDocuments,
  updateDocumentStatusAction
} from "@/lib/actions/documents";
import { getStudent } from "@/lib/actions/students";
import {
  hasUploadedChecklistFile,
  isChecklistReady,
  needsChecklistReview
} from "@/lib/checklists/request-logic";
import { formatDateTime } from "@/lib/date";

const reviewStatuses = [
  "accepted",
  "needs_review",
  "wrong_document",
  "wrong_format",
  "blurry",
  "expired",
  "rejected",
  "official_verification_required",
  "officially_verified"
] as const;

const scanStatusTone: Record<string, string> = {
  not_scanned: "info",
  scanning: "warning",
  scanned: "success",
  scan_failed: "warning",
  needs_review: "warning"
};

function scanStatusLabel(status?: string | null) {
  switch (status) {
    case "scanned":
      return "AI scan complete";
    case "scanning":
      return "AI scan running";
    case "needs_review":
      return "Manual review needed";
    case "scan_failed":
      return "AI scan failed. Manual review needed.";
    default:
      return "Not scanned";
  }
}

function ScanStatusBadge({ status }: { status?: string | null }) {
  const value = status || "not_scanned";
  return (
    <span className={`chip ${scanStatusTone[value] || "info"}`}>
      {scanStatusLabel(value)}
    </span>
  );
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes < 0) {
    return "Size unavailable";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type RelatedRecord = {
  created_at?: string | null;
};

function latestByCreatedAt<TRecord extends RelatedRecord>(records?: TRecord[]) {
  return [...(records ?? [])].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  })[0];
}

type ChecklistPart = {
  id: string;
  part_name: string;
  is_required?: boolean | null;
  sort_order?: number | null;
};

type ChecklistItemForDocuments = {
  id: string;
  document_name: string;
  status?: string | null;
  upload_type?: string | null;
  document_parts?: ChecklistPart[] | null;
};

type StudentDocument = Awaited<ReturnType<typeof listStudentDocuments>>[number];

function checklistParts(item: ChecklistItemForDocuments) {
  return [...(item.document_parts ?? [])].sort((left, right) => {
    const leftOrder = left.sort_order ?? 0;
    const rightOrder = right.sort_order ?? 0;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.part_name.localeCompare(right.part_name);
  });
}

function sortedUploads(documents: StudentDocument[]) {
  return [...documents].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

    return rightTime - leftTime;
  });
}

function latestUploadForPart(documents: StudentDocument[], partId: string) {
  return sortedUploads(
    documents.filter((document) => document.document_part_id === partId)
  )[0];
}

function aggregateScanStatus(documents: StudentDocument[]) {
  if (!documents.length) {
    return null;
  }

  if (documents.some((document) => document.scan_status === "scanning")) {
    return "scanning";
  }

  if (documents.some((document) => document.scan_status === "scan_failed")) {
    return "scan_failed";
  }

  if (documents.some((document) => document.scan_status === "needs_review")) {
    return "needs_review";
  }

  if (documents.every((document) => document.scan_status === "scanned")) {
    return "scanned";
  }

  return "not_scanned";
}

function uploadLabel(document: StudentDocument, fallback?: string | null) {
  return document.document_part?.part_name || fallback || "Uploaded file";
}

function viewerUpload(
  document: StudentDocument,
  label: string
): DocumentViewerUpload {
  const uploadTime =
    formatDateTime(document.uploaded_at) ||
    formatDateTime(document.created_at) ||
    "Upload date unavailable";

  return {
    id: document.id,
    label,
    originalFilename: document.original_filename,
    signedUrl: document.signed_url,
    mimeType: document.mime_type,
    fileSizeLabel: formatBytes(document.file_size_bytes),
    uploadedAtLabel: uploadTime,
    status: document.status,
    scanStatus: document.scan_status,
    scanStatusLabel: scanStatusLabel(document.scan_status),
    scanSummary: document.scan_summary,
    extraction: latestByCreatedAt(document.document_extractions),
    issues: document.document_issues ?? []
  };
}

function multipartSummary(input: {
  item: ChecklistItemForDocuments;
  documents: StudentDocument[];
}) {
  const parts = checklistParts(input.item);
  const requiredParts = parts.filter((part) => part.is_required !== false);
  const uploadedRequiredCount = requiredParts.filter((part) =>
    input.documents.some((document) => document.document_part_id === part.id)
  ).length;
  const requiredTotal = Math.max(requiredParts.length, 1);
  const missingRequiredParts = requiredParts.filter(
    (part) =>
      !input.documents.some((document) => document.document_part_id === part.id)
  );

  return {
    parts,
    requiredParts,
    uploadedRequiredCount,
    requiredTotal,
    missingRequiredParts
  };
}

export default async function StudentDocumentsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ requestId?: string }>;
}) {
  const { id } = await params;
  const { requestId } = (await searchParams) ?? {};
  const [student, requestedItems, documents] = await Promise.all([
    getStudent(id),
    listRequestedChecklistItems(id),
    listStudentDocuments(id)
  ]);

  const uploadsByChecklistItemId = new Map<string, typeof documents>();

  for (const document of documents) {
    const current = uploadsByChecklistItemId.get(document.checklist_item_id) || [];
    current.push(document);
    uploadsByChecklistItemId.set(document.checklist_item_id, current);
  }

  const requestedSummary = {
    total: requestedItems.length,
    missing: requestedItems.filter((item) => (item.status || "missing") === "missing").length,
    uploaded: requestedItems.filter(hasUploadedChecklistFile).length,
    ready: requestedItems.filter(isChecklistReady).length,
    needsReview: requestedItems.filter(needsChecklistReview).length
  };

  const visibleItems = requestedItems;

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title={student.full_name}
          subtitle="Review uploaded files and update their status."
          actions={
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
          }
        />
        <StudentTabs active="documents" studentId={id} />

        {!requestedItems.length ? (
          <section className="panel empty-state">
            <strong>No documents requested yet</strong>
            <p>
              Go to the Checklist tab and request the documents you want to collect
              from this student.
            </p>
            <Link className="button" href={`/students/${id}/checklist`}>
              Go to checklist
            </Link>
          </section>
        ) : null}

        {requestedItems.length ? (
          <section className="metric-grid case-metrics">
            <div className="metric-card">
              <span>Requested</span>
              <strong>{requestedSummary.total}</strong>
            </div>
            <div className="metric-card">
              <span>Missing</span>
              <strong>{requestedSummary.missing}</strong>
            </div>
            <div className="metric-card">
              <span>Uploaded</span>
              <strong>{requestedSummary.uploaded}</strong>
            </div>
            <div className="metric-card">
              <span>Needs review</span>
              <strong>{requestedSummary.needsReview}</strong>
            </div>
            <div className="metric-card">
              <span>Ready</span>
              <strong>{requestedSummary.ready}</strong>
            </div>
          </section>
        ) : null}

        {visibleItems.length ? (
          <section className="panel section-stack">
            <div className="section-title">
              <div>
                <h2>Requested documents</h2>
                <p>Review uploaded files and update their status.</p>
              </div>
            </div>

            <div className="document-requested-list">
              {visibleItems.map((item) => {
                const checklistItem = item as ChecklistItemForDocuments;
                const itemDocuments = uploadsByChecklistItemId.get(item.id) || [];
                const hasUploads = itemDocuments.length > 0;
                const sortedDocuments = sortedUploads(itemDocuments);
                const latestDocument = sortedDocuments[0];
                const currentStatus =
                  checklistItem.status || latestDocument?.status || "missing";
                const aggregateStatus = aggregateScanStatus(sortedDocuments);
                const isHighlighted = requestId === item.id;
                const isMultipart = checklistItem.upload_type === "multi_part";
                const {
                  parts,
                  uploadedRequiredCount,
                  requiredTotal,
                  missingRequiredParts
                } = multipartSummary({
                  item: checklistItem,
                  documents: itemDocuments
                });
                const headerSummary = isMultipart
                  ? `${uploadedRequiredCount}/${requiredTotal} sides uploaded`
                  : hasUploads
                    ? `${itemDocuments.length} file${itemDocuments.length === 1 ? "" : "s"} uploaded`
                    : "No upload yet";
                const viewerUploads = sortedDocuments.map((document) =>
                  viewerUpload(
                    document,
                    uploadLabel(document, isMultipart ? "Uploaded side" : "Uploaded file")
                  )
                );

                return (
                  <article
                    className={`document-review-card ${isHighlighted ? "is-highlighted" : ""}`}
                    id={`request-${item.id}`}
                    key={item.id}
                  >
                    <div className="section-title">
                      <div>
                        <h3>{item.document_name}</h3>
                        <p>{headerSummary}</p>
                      </div>
                      <div className="button-row">
                        <DocumentStatusBadge status={currentStatus} />
                        {aggregateStatus ? (
                          <ScanStatusBadge status={aggregateStatus} />
                        ) : null}
                        {hasUploads ? (
                          <DocumentUploadsViewer
                            documentName={item.document_name}
                            studentId={id}
                            uploads={viewerUploads}
                            buttonLabel="View uploads"
                          />
                        ) : null}
                      </div>
                    </div>

                    {!hasUploads ? (
                      <div className="document-missing-panel">
                        <div>
                          <strong>Missing</strong>
                          <p>Waiting for student upload.</p>
                        </div>
                        <div className="button-row">
                          <Link className="button secondary" href={`/students/${id}/follow-up`}>
                            Send follow-up
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="document-upload-list">
                        {isMultipart ? (
                          <div className="document-part-list">
                            {parts.map((part) => {
                              const document = latestUploadForPart(itemDocuments, part.id);
                              const upload = document
                                ? viewerUpload(document, part.part_name)
                                : null;

                              return (
                                <div className="document-part-row" key={part.id}>
                                  <div>
                                    <strong>{part.part_name}</strong>
                                    <span>
                                      {document
                                        ? `${formatDateTime(document.uploaded_at) ||
                                            formatDateTime(document.created_at) ||
                                            "Uploaded"} - ${formatBytes(document.file_size_bytes)}`
                                        : part.is_required === false
                                          ? "Optional"
                                          : "Missing"}
                                    </span>
                                  </div>
                                  <div className="button-row">
                                    {document ? (
                                      <>
                                        <span className="chip success">Uploaded</span>
                                        <ScanStatusBadge status={document.scan_status} />
                                        <DocumentUploadsViewer
                                          documentName={item.document_name}
                                          studentId={id}
                                          uploads={viewerUploads}
                                          initialUploadId={document.id}
                                          buttonLabel="View"
                                        />
                                        <ScanDocumentButton
                                          documentId={document.id}
                                          scanStatus={document.scan_status}
                                        />
                                      </>
                                    ) : (
                                      <span
                                        className={`chip ${part.is_required === false ? "info" : "danger"}`}
                                      >
                                        {part.is_required === false
                                          ? "Optional"
                                          : "Missing"}
                                      </span>
                                    )}
                                  </div>
                                  {upload ? (
                                    <form
                                      action={updateDocumentStatusAction}
                                      className="inline-status-form document-part-review-form"
                                    >
                                      <input type="hidden" name="id" value={upload.id} />
                                      <input type="hidden" name="student_id" value={id} />
                                      <select name="status" defaultValue={upload.status}>
                                        {reviewStatuses.map((status) => (
                                          <option key={status} value={status}>
                                            {status.replaceAll("_", " ")}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        className="button secondary"
                                        type="submit"
                                      >
                                        Save review status
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              );
                            })}
                            {missingRequiredParts.length ? (
                              <div className="document-missing-panel compact-missing-panel">
                                <div>
                                  <strong>Missing required side</strong>
                                  <p>
                                    {missingRequiredParts
                                      .map((part) => part.part_name)
                                      .join(", ")}
                                  </p>
                                </div>
                                <Link
                                  className="button secondary"
                                  href={`/students/${id}/follow-up`}
                                >
                                  Send follow-up
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {sortedDocuments.map((document, index) => {
                          const extraction = latestByCreatedAt(
                            document.document_extractions
                          );
                          const issues = document.document_issues ?? [];
                          const uploadTime =
                            formatDateTime(document.uploaded_at) ||
                            formatDateTime(document.created_at) ||
                            "Upload date unavailable";

                          if (isMultipart && document.document_part_id) {
                            return null;
                          }

                          return (
                            <div className="document-upload-card" key={document.id}>
                              <div className="document-upload-header">
                                <div>
                                  <strong>
                                    {document.document_part?.part_name
                                      ? `${document.document_part.part_name}: `
                                      : ""}
                                    {document.original_filename}
                                  </strong>
                                  <p>
                                    {uploadTime} - {formatBytes(document.file_size_bytes)}
                                    {index === 0 ? " - Latest upload" : ""}
                                  </p>
                                </div>
                                <div className="button-row">
                                  <DocumentStatusBadge status={document.status} />
                                  <ScanStatusBadge status={document.scan_status} />
                                </div>
                              </div>

                              <div className="document-file-actions">
                                <DocumentUploadsViewer
                                  documentName={item.document_name}
                                  studentId={id}
                                  uploads={viewerUploads}
                                  initialUploadId={document.id}
                                  buttonLabel="View file"
                                />
                                <ScanDocumentButton
                                  documentId={document.id}
                                  scanStatus={document.scan_status}
                                />
                              </div>

                              <form
                                action={updateDocumentStatusAction}
                                className="inline-status-form"
                              >
                                <input type="hidden" name="id" value={document.id} />
                                <input type="hidden" name="student_id" value={id} />
                                <select name="status" defaultValue={document.status}>
                                  {reviewStatuses.map((status) => (
                                    <option key={status} value={status}>
                                      {status.replaceAll("_", " ")}
                                    </option>
                                  ))}
                                </select>
                                <button className="button secondary" type="submit">
                                  Save review status
                                </button>
                              </form>

                              {(extraction || issues.length || document.scan_status === "scan_failed") ? (
                                <div className="document-evidence-grid">
                                  <div>
                                    <h4>Scan output</h4>
                                    <ExtractionView extraction={extraction || undefined} />
                                  </div>
                                  <div>
                                    <h4>Issues</h4>
                                    <DocumentIssuesList issues={issues} />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
