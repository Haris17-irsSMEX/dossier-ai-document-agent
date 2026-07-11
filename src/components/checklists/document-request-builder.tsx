import {
  FileText,
  Plus,
  SlidersHorizontal
} from "lucide-react";
import Link from "next/link";

import {
  markChecklistItemNotNeededAction
} from "@/lib/actions/checklists";
import { CustomDocumentRequestForm } from "@/components/checklists/custom-document-request-form";
import { DocumentOptionsLibrary } from "@/components/checklists/document-options-library";
import { DocumentRequestForm } from "@/components/checklists/document-request-form";
import { getChecklistPhase } from "@/lib/checklists/phases";
import {
  hasUploadedChecklistFile,
  isChecklistReady,
  isRequested,
  needsChecklistReview
} from "@/lib/checklists/request-logic";

type ChecklistItem = Parameters<typeof DocumentRequestForm>[0]["item"] & {
  status: string;
  phase_label?: string | null;
  phase_order?: number | null;
  category_label?: string | null;
  item_order?: number | null;
  is_custom?: boolean | null;
  is_archived?: boolean | null;
  source_template_key?: string | null;
};

function sortItems(left: ChecklistItem, right: ChecklistItem) {
  return (
    (left.phase_order ?? 999) - (right.phase_order ?? 999) ||
    (left.item_order ?? 999) - (right.item_order ?? 999) ||
    left.document_name.localeCompare(right.document_name)
  );
}

function requestStatusLabel(item: ChecklistItem) {
  if (isChecklistReady(item)) return "Ready";
  if (needsChecklistReview(item)) return "Needs review";
  if (hasUploadedChecklistFile(item)) return "Uploaded";
  return "Missing";
}

function requestStatusTone(item: ChecklistItem) {
  if (isChecklistReady(item)) return "success";
  if (needsChecklistReview(item)) return "warning";
  if (hasUploadedChecklistFile(item)) return "info";
  return "danger";
}

function phaseLabel(item: ChecklistItem) {
  return item.phase_label || getChecklistPhase(item.phase_slug).label;
}

function RequestEditor({ item }: { item: ChecklistItem }) {
  return (
    <details className="request-editor-disclosure">
      <summary className="button secondary compact-button">
        <SlidersHorizontal aria-hidden="true" size={15} />
        Edit
      </summary>
      <div className="request-editor-panel">
        <DocumentRequestForm actionLabel="Save changes" item={item} />
      </div>
    </details>
  );
}

function RequestedDocumentRow({
  item,
  studentId
}: {
  item: ChecklistItem;
  studentId: string;
}) {
  return (
    <article className="phase-request-row">
      <div className="phase-request-main">
        <div className="phase-request-title">
          <strong>{item.document_name}</strong>
          <span className="chip info">Requested</span>
          <span className={`chip ${requestStatusTone(item)}`}>
            {requestStatusLabel(item)}
          </span>
        </div>
        <p>{item.instructions || "No upload instructions added."}</p>
        <div className="phase-request-meta">
          <span>{phaseLabel(item)}</span>
          <span>{item.upload_type.replaceAll("_", " ")}</span>
          <span>{item.accepted_formats.join(", ").toUpperCase()}</span>
          {item.is_custom ? <span>Custom request</span> : null}
        </div>
      </div>
      <div className="phase-request-actions">
        <Link className="button secondary compact-button" href={`/students/${studentId}/documents`}>
          <FileText aria-hidden="true" size={15} />
          View uploads
        </Link>
        <form action={markChecklistItemNotNeededAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="student_id" value={item.student_id} />
          <button className="button secondary compact-button" type="submit">
            Stop requesting
          </button>
        </form>
        <RequestEditor item={item} />
      </div>
    </article>
  );
}

export function DocumentRequestBuilder({
  studentId,
  items
}: {
  studentId: string;
  items: ChecklistItem[];
  caseStage?: string | null;
}) {
  const activeItems = items.filter((item) => item.is_archived !== true);
  const requestedItems = activeItems.filter(isRequested).sort(sortItems);
  const suggestedItems = activeItems.filter((item) => !isRequested(item)).sort(sortItems);

  if (!items.length) {
    return (
      <div className="empty-state">
        <strong>No document options yet</strong>
        <p>Add a custom document request to start collecting documents manually.</p>
        <details className="custom-request-disclosure">
          <summary className="button">
            <Plus aria-hidden="true" size={16} />
            Add document request
          </summary>
          <div className="panel compact">
            <CustomDocumentRequestForm studentId={studentId} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="request-builder-sections">
      <section className="panel request-builder-panel">
        <div className="section-title">
          <div>
            <h2>Requested from student</h2>
            <p>These documents are visible to the student.</p>
          </div>
          <details className="custom-request-disclosure">
            <summary className="button secondary compact-button">
              <Plus aria-hidden="true" size={15} />
              Add document request
            </summary>
            <div className="custom-request-panel">
              <CustomDocumentRequestForm studentId={studentId} />
            </div>
          </details>
        </div>

        {requestedItems.length ? (
          <div className="phase-request-list">
            {requestedItems.map((item) => (
              <RequestedDocumentRow item={item} key={item.id} studentId={studentId} />
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <strong>No documents requested yet</strong>
            <p>Select options below when you want the student to upload them.</p>
          </div>
        )}
      </section>

      <DocumentOptionsLibrary items={suggestedItems} studentId={studentId} />
    </div>
  );
}
