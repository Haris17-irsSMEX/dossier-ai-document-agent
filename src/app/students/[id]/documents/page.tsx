import Link from "next/link";

import { DocumentIssuesList } from "@/components/documents/document-issues-list";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
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
      return "Scan failed - manual review needed";
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
                const itemDocuments = uploadsByChecklistItemId.get(item.id) || [];
                const hasUploads = itemDocuments.length > 0;
                const sortedDocuments = [...itemDocuments].sort((left, right) => {
                  const leftTime = left.created_at
                    ? new Date(left.created_at).getTime()
                    : 0;
                  const rightTime = right.created_at
                    ? new Date(right.created_at).getTime()
                    : 0;

                  return rightTime - leftTime;
                });
                const latestDocument = sortedDocuments[0];
                const currentStatus = latestDocument?.status || item.status || "missing";
                const isHighlighted = requestId === item.id;

                return (
                  <article
                    className={`document-review-card ${isHighlighted ? "is-highlighted" : ""}`}
                    id={`request-${item.id}`}
                    key={item.id}
                  >
                    <div className="section-title">
                      <div>
                        <h3>{item.document_name}</h3>
                        <p>
                          {hasUploads
                            ? `${itemDocuments.length} upload${itemDocuments.length === 1 ? "" : "s"}`
                            : "No upload yet"}
                        </p>
                      </div>
                      <div className="button-row">
                        <DocumentStatusBadge status={currentStatus} />
                        {latestDocument ? (
                          <ScanStatusBadge status={latestDocument.scan_status} />
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
                        {sortedDocuments.map((document, index) => {
                          const extraction = latestByCreatedAt(
                            document.document_extractions
                          );
                          const issues = document.document_issues ?? [];
                          const uploadTime =
                            formatDateTime(document.uploaded_at) ||
                            formatDateTime(document.created_at) ||
                            "Upload date unavailable";

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
                                {document.signed_url ? (
                                  <a
                                    className="button secondary compact-button"
                                    href={document.signed_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    View file
                                  </a>
                                ) : (
                                  <button
                                    className="button secondary compact-button"
                                    type="button"
                                    disabled
                                  >
                                    View file unavailable
                                  </button>
                                )}
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
