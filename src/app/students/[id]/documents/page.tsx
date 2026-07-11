import Link from "next/link";

import { DocumentIssuesList } from "@/components/documents/document-issues-list";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { ExtractionView } from "@/components/documents/extraction-view";
import { ScanDocumentButton } from "@/components/documents/scan-document-button";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import {
  listChecklistItems,
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
  scan_failed: "danger",
  needs_review: "warning"
};

function ScanStatusBadge({ status }: { status?: string | null }) {
  const value = status || "not_scanned";
  return (
    <span className={`chip ${scanStatusTone[value] || "info"}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
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
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, requestedItems, allItems, documents] = await Promise.all([
    getStudent(id),
    listRequestedChecklistItems(id),
    listChecklistItems(id),
    listStudentDocuments(id)
  ]);

  const uploadsByChecklistItemId = new Map<string, typeof documents>();

  for (const document of documents) {
    const current = uploadsByChecklistItemId.get(document.checklist_item_id) || [];
    current.push(document);
    uploadsByChecklistItemId.set(document.checklist_item_id, current);
  }

  const historicalItems = allItems.filter((item) => {
    if (item.is_requested === true && item.visible_to_student === true && item.is_archived !== true) {
      return false;
    }

    return (uploadsByChecklistItemId.get(item.id)?.length || 0) > 0;
  });

  const requestedSummary = {
    total: requestedItems.length,
    missing: requestedItems.filter((item) => (item.status || "missing") === "missing").length,
    uploaded: requestedItems.filter(hasUploadedChecklistFile).length,
    ready: requestedItems.filter(isChecklistReady).length,
    needsReview: requestedItems.filter(needsChecklistReview).length
  };

  const visibleItems = [...requestedItems, ...historicalItems];

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
                const latestDocument = latestByCreatedAt(itemDocuments);
                const latestExtraction = latestDocument
                  ? latestByCreatedAt(latestDocument.document_extractions)
                  : null;
                const issues = latestDocument?.document_issues ?? [];
                const hasUploads = itemDocuments.length > 0;
                const isHistoricalOnly = !requestedItems.some(
                  (requestedItem) => requestedItem.id === item.id
                );
                const currentStatus = latestDocument?.status || item.status || "missing";

                return (
                  <article className="document-review-card" key={item.id}>
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
                        {isHistoricalOnly ? (
                          <span className="chip info">Not currently requested</span>
                        ) : null}
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
                          <Link className="button secondary" href={`/students/${id}/checklist`}>
                            Stop requesting
                          </Link>
                          <Link className="button secondary" href={`/students/${id}/follow-up`}>
                            Send follow-up
                          </Link>
                        </div>
                      </div>
                    ) : latestDocument ? (
                      <>
                        <div className="document-upload-meta">
                          <span>{latestDocument.original_filename}</span>
                          <div className="button-row">
                            <Link className="button secondary compact-button" href={`/students/${id}/checklist`}>
                              View uploads
                            </Link>
                            <ScanDocumentButton
                              documentId={latestDocument.id}
                              scanStatus={latestDocument.scan_status}
                            />
                          </div>
                        </div>
                        <form action={updateDocumentStatusAction} className="inline-status-form">
                          <input type="hidden" name="id" value={latestDocument.id} />
                          <input type="hidden" name="student_id" value={id} />
                          <select name="status" defaultValue={latestDocument.status}>
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
                        <div className="document-evidence-grid">
                          <div>
                            <h4>Extracted evidence</h4>
                            <ExtractionView extraction={latestExtraction || undefined} />
                          </div>
                          <div>
                            <h4>Issues</h4>
                            <DocumentIssuesList issues={issues} />
                          </div>
                        </div>
                      </>
                    ) : null}
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
