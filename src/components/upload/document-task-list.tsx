import Link from "next/link";

import {
  CHECKLIST_PHASES,
  getChecklistPhase
} from "@/lib/checklists/phases";
import type { ChecklistItem, UploadedDocument } from "./types";
import {
  documentProgress,
  formatList,
  statusTone,
  studentDocumentRequestHint,
  studentDocumentRequirementLabel,
  studentDocumentRequirementTone
} from "./upload-utils";

export function DocumentTaskList({
  baseHref,
  items,
  documents,
  activeItemId
}: {
  baseHref: string;
  items: ChecklistItem[];
  documents: UploadedDocument[];
  activeItemId?: string | null;
}) {
  const visibleItems = items.filter(
    (item) =>
      item.visible_to_student !== false &&
      item.is_requested !== false &&
      item.is_archived !== true
  );

  return (
    <div className="student-phase-list">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = visibleItems
          .filter((item) => getChecklistPhase(item.phase_slug).slug === phase.slug)
          .sort(
            (left, right) =>
              (left.item_order ?? 999) - (right.item_order ?? 999)
          );

        if (!phaseItems.length) {
          return null;
        }

        return (
          <section className="student-phase-section" key={phase.slug}>
            <div className="student-phase-heading">
              <div>
                <span className={`phase-dot phase-${phase.accent}`} />
                <h2>{phase.studentLabel}</h2>
              </div>
              <span>{phaseItems.length} requests</span>
            </div>
            <div className="document-task-list">
              {phaseItems.map((item) => {
                const progress = documentProgress(item, documents);
                const action = progress.hasAnyUpload
                  ? progress.isComplete
                    ? "Review"
                    : "Continue"
                  : "Start";
                const requirement = studentDocumentRequirementLabel(item);
                const requestHint = studentDocumentRequestHint(item);

                return (
                  <article
                    className={`document-task-card ${activeItemId === item.id ? "active" : ""}`}
                    key={item.id}
                  >
                    <div>
                      <div className="document-task-title">
                        <div>
                          <h3>{item.document_name}</h3>
                          <span
                            className={`chip ${studentDocumentRequirementTone(item)}`}
                          >
                            {requirement}
                          </span>
                        </div>
                        <span
                          className={`chip ${statusTone(progress.status.toLowerCase().replaceAll(" ", "_"))}`}
                        >
                          {progress.status}
                        </span>
                      </div>
                      <p className="muted">
                        {item.instructions || "Upload a clear file."}
                      </p>
                      {requestHint ? <p className="muted">{requestHint}</p> : null}
                      <div className="document-task-meta">
                        <span>{formatList(item.accepted_formats)}</span>
                        <span>
                          {progress.missingCount
                            ? `${progress.missingCount} missing`
                            : "No required parts missing"}
                        </span>
                      </div>
                    </div>
                    <Link
                      aria-label={`${action} ${item.document_name}`}
                      className={`button start-button ${action === "Review" ? "secondary" : ""}`}
                      href={`${baseHref}?documentId=${encodeURIComponent(item.id)}`}
                    >
                      {action}
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
