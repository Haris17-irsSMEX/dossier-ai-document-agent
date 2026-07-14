"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";

import { DocumentIssuesList } from "@/components/documents/document-issues-list";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { ExtractionView } from "@/components/documents/extraction-view";
import { updateDocumentStatusAction } from "@/lib/actions/documents";

type ViewerExtraction = {
  id: string;
  raw_text?: string | null;
  confidence?: number | null;
  status?: string | null;
  error_message?: string | null;
  extracted_fields?: {
    ai_validation?: {
      detected_document_type?: string;
      confidence?: number;
      extracted_fields?: Record<string, string | null>;
    } | null;
    ocr_metadata?: Record<string, unknown>;
    ai_validation_error?: string | null;
  } | null;
  created_at?: string | null;
};

type ViewerIssue = {
  id: string;
  issue_type: string;
  severity: string;
  message: string;
  evidence?: string | null;
  recommended_action?: string | null;
  is_resolved?: boolean | null;
  created_at?: string | null;
};

export type DocumentViewerUpload = {
  id: string;
  label: string;
  originalFilename: string;
  signedUrl?: string | null;
  mimeType?: string | null;
  fileSizeLabel: string;
  uploadedAtLabel: string;
  status: string;
  scanStatus?: string | null;
  scanStatusLabel: string;
  scanSummary?: string | null;
  extraction?: ViewerExtraction | null;
  issues: ViewerIssue[];
};

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

function extensionFor(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function isImage(upload?: DocumentViewerUpload | null) {
  if (!upload) {
    return false;
  }

  const mimeType = upload.mimeType?.toLowerCase() || "";
  const extension = extensionFor(upload.originalFilename);

  return (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType) ||
    ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)
  );
}

function isPdf(upload?: DocumentViewerUpload | null) {
  if (!upload) {
    return false;
  }

  return (
    upload.mimeType?.toLowerCase() === "application/pdf" ||
    extensionFor(upload.originalFilename) === "pdf"
  );
}

export function DocumentUploadsViewer({
  documentName,
  studentId,
  uploads,
  initialUploadId,
  buttonLabel = "View"
}: {
  documentName: string;
  studentId: string;
  uploads: DocumentViewerUpload[];
  initialUploadId?: string;
  buttonLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUploadId, setSelectedUploadId] = useState(
    initialUploadId || uploads[0]?.id || ""
  );
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const selectedUpload =
    uploads.find((upload) => upload.id === selectedUploadId) ?? uploads[0] ?? null;
  const hasMultipleUploads = uploads.length > 1;
  const activeIssues = useMemo(
    () => selectedUpload?.issues.filter((issue) => !issue.is_resolved) ?? [],
    [selectedUpload]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);

    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isOpen]);

  function openViewer(uploadId?: string) {
    setSelectedUploadId(uploadId || initialUploadId || uploads[0]?.id || "");
    setZoom(1);
    setRotation(0);
    setIsOpen(true);
  }

  if (!uploads.length) {
    return (
      <button className="button secondary compact-button" type="button" disabled>
        View unavailable
      </button>
    );
  }

  return (
    <>
      <button
        className="button secondary compact-button"
        type="button"
        onClick={() => openViewer(initialUploadId)}
      >
        {buttonLabel}
      </button>

      {isOpen && selectedUpload ? (
        <div
          className="document-viewer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${documentName} uploads`}
        >
          <div className="document-viewer-shell">
            <div className="document-viewer-header">
              <div>
                <span className="muted">{documentName}</span>
                <h2>{selectedUpload.label}</h2>
              </div>
              <button
                className="button secondary compact-button"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>

            <div
              className={`document-viewer-layout ${hasMultipleUploads ? "" : "single"}`}
            >
              {hasMultipleUploads ? (
                <aside className="document-viewer-tabs" aria-label="Uploaded files">
                  {uploads.map((upload) => (
                    <button
                      className={upload.id === selectedUpload.id ? "active" : ""}
                      key={upload.id}
                      type="button"
                      onClick={() => {
                        setSelectedUploadId(upload.id);
                        setZoom(1);
                        setRotation(0);
                      }}
                    >
                      <strong>{upload.label}</strong>
                      <span>{upload.originalFilename}</span>
                    </button>
                  ))}
                </aside>
              ) : null}

              <div className="document-viewer-main">
                <div className="document-viewer-stage">
                  {selectedUpload.signedUrl && isImage(selectedUpload) ? (
                    <img
                      alt={`${documentName} ${selectedUpload.label}`}
                      src={selectedUpload.signedUrl}
                      style={{
                        transform: `scale(${zoom}) rotate(${rotation}deg)`
                      }}
                    />
                  ) : selectedUpload.signedUrl && isPdf(selectedUpload) ? (
                    <iframe
                      title={`${documentName} ${selectedUpload.label}`}
                      src={selectedUpload.signedUrl}
                    />
                  ) : (
                    <div className="document-viewer-placeholder">
                      <strong>Preview not available</strong>
                      <p>
                        This file can still be reviewed. Use Open original or Download.
                      </p>
                    </div>
                  )}
                </div>

                <div className="document-viewer-actions">
                  {isImage(selectedUpload) ? (
                    <>
                      <button
                        className="button secondary compact-button"
                        type="button"
                        onClick={() => setZoom((value) => Math.min(value + 0.15, 2.5))}
                      >
                        Zoom in
                      </button>
                      <button
                        className="button secondary compact-button"
                        type="button"
                        onClick={() => setZoom((value) => Math.max(value - 0.15, 0.5))}
                      >
                        Zoom out
                      </button>
                      <button
                        className="button secondary compact-button"
                        type="button"
                        onClick={() => setRotation((value) => value + 90)}
                      >
                        Rotate
                      </button>
                    </>
                  ) : null}
                  {selectedUpload.signedUrl ? (
                    <>
                      <a
                        className="button secondary compact-button"
                        href={selectedUpload.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open original
                      </a>
                      <a
                        className="button secondary compact-button"
                        href={selectedUpload.signedUrl}
                        download={selectedUpload.originalFilename}
                      >
                        Download
                      </a>
                    </>
                  ) : null}
                </div>

                <div className="document-viewer-meta">
                  <div>
                    <span className="muted">File name</span>
                    <strong>{selectedUpload.originalFilename}</strong>
                  </div>
                  <div>
                    <span className="muted">Uploaded</span>
                    <strong>{selectedUpload.uploadedAtLabel}</strong>
                  </div>
                  <div>
                    <span className="muted">Type / size</span>
                    <strong>
                      {selectedUpload.mimeType || "Unknown type"} -{" "}
                      {selectedUpload.fileSizeLabel}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Scan</span>
                    <strong>{selectedUpload.scanStatusLabel}</strong>
                  </div>
                </div>

                <form
                  action={updateDocumentStatusAction}
                  className="inline-status-form document-viewer-review-form"
                >
                  <input type="hidden" name="id" value={selectedUpload.id} />
                  <input type="hidden" name="student_id" value={studentId} />
                  <select name="status" defaultValue={selectedUpload.status}>
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

                <div className="document-viewer-scan-summary">
                  <div className="button-row">
                    <DocumentStatusBadge status={selectedUpload.status} />
                    <span className="chip info">{selectedUpload.scanStatusLabel}</span>
                    {activeIssues.length ? (
                      <span className="chip warning">
                        {activeIssues.length} issue{activeIssues.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {selectedUpload.scanSummary ? (
                    <p className="muted">{selectedUpload.scanSummary}</p>
                  ) : null}
                </div>

                <div className="document-evidence-grid">
                  <div>
                    <h4>Scan output</h4>
                    <ExtractionView extraction={selectedUpload.extraction || undefined} />
                  </div>
                  <div>
                    <h4>Issues</h4>
                    <DocumentIssuesList issues={selectedUpload.issues} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
