import Link from "next/link";

import { DocumentIssuesList } from "@/components/documents/document-issues-list";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { ExtractionView } from "@/components/documents/extraction-view";
import { ScanDocumentButton } from "@/components/documents/scan-document-button";
import { StudentTabs } from "@/components/students/student-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { updateChecklistStatusAction } from "@/lib/actions/checklists";
import {
  listStudentDocuments,
  updateDocumentStatusAction
} from "@/lib/actions/documents";
import { listChecklistItems } from "@/lib/actions/checklists";
import { getStudent } from "@/lib/actions/students";
import { checklistStatuses } from "@/lib/checklists/rules";

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
  const [student, items, documents] = await Promise.all([
    getStudent(id),
    listChecklistItems(id),
    listStudentDocuments(id)
  ]);

  return (
    <main className="app-shell">
      <div className="workspace section-stack">
        <PageHeader
          title={student.full_name}
          subtitle="Review uploads and update document status."
          actions={
            <Link className="button secondary" href={`/students/${id}`}>
              Student profile
            </Link>
          }
        />
        <StudentTabs active="documents" studentId={id} />
        <section className="panel">
          <h2>Checklist statuses</h2>
          <div className="list">
            {items.map((item) => (
              <form action={updateChecklistStatusAction} className="status-row" key={item.id}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="student_id" value={id} />
                <strong>{item.document_name}</strong>
                <DocumentStatusBadge status={item.status} />
                <select name="status" defaultValue={item.status}>
                  {checklistStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <button className="button secondary" type="submit">
                  Update
                </button>
              </form>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Uploaded files</h2>
          {documents.length ? (
            <div className="document-review-list">
              {documents.map((document) => {
                const latestExtraction = latestByCreatedAt(document.document_extractions);
                const issues = document.document_issues ?? [];

                return (
                  <article className="document-review-card" key={document.id}>
                    <div className="section-title">
                      <div>
                        <h3>{document.original_filename}</h3>
                        <p>
                          {document.checklist_item?.document_name}
                          {document.document_part?.part_name ? ` - ${document.document_part.part_name}` : ""}
                        </p>
                      </div>
                      <div className="button-row">
                        <DocumentStatusBadge status={document.status} />
                        <ScanStatusBadge status={document.scan_status} />
                        <ScanDocumentButton
                          documentId={document.id}
                          scanStatus={document.scan_status}
                        />
                      </div>
                    </div>
                    <form action={updateDocumentStatusAction} className="inline-status-form">
                      <input type="hidden" name="id" value={document.id} />
                      <input type="hidden" name="student_id" value={id} />
                      <select name="status" defaultValue={document.status}>
                        {checklistStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      <button className="button secondary" type="submit">
                        Save manual status
                      </button>
                    </form>
                    <div className="document-evidence-grid">
                      <div>
                        <h4>Extracted evidence</h4>
                        <ExtractionView extraction={latestExtraction} />
                      </div>
                      <div>
                        <h4>Issues</h4>
                        <DocumentIssuesList issues={issues} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No uploads yet</strong>
              <p>Generate an upload link from the checklist page.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
