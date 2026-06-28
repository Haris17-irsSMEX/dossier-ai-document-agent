import Link from "next/link";

import type { ChecklistItem, UploadedDocument } from "./types";
import { documentProgress, formatList, statusTone } from "./upload-utils";

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
  return (
    <div className="document-task-list">
      {items.map((item) => {
        const progress = documentProgress(item, documents);
        const action = progress.hasAnyUpload
          ? progress.isComplete
            ? "Review"
            : "Continue"
          : "Start";

        return (
          <article
            className={`document-task-card ${activeItemId === item.id ? "active" : ""}`}
            key={item.id}
          >
            <div>
              <div className="document-task-title">
                <h2>{item.document_name}</h2>
                <span className={`chip ${statusTone(progress.status.toLowerCase().replaceAll(" ", "_"))}`}>
                  {progress.status}
                </span>
              </div>
              <p className="muted">{item.instructions || "Upload a clear file."}</p>
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
  );
}
