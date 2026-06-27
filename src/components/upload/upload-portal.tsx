"use client";

import { useState } from "react";

import { DocumentCaptureWizard } from "./document-capture-wizard";
import { DocumentTaskList } from "./document-task-list";
import type { ChecklistItem, UploadedDocument } from "./types";

export function UploadPortal({
  token,
  studentName,
  checklistItems,
  documents,
  error,
  success,
  currentDocumentId
}: {
  token: string;
  studentName: string;
  checklistItems: ChecklistItem[];
  documents: UploadedDocument[];
  error?: string;
  success?: string;
  currentDocumentId?: string;
}) {
  const [uploadedDocuments, setUploadedDocuments] = useState(() => documents);
  const baseHref = `/upload/${encodeURIComponent(token)}`;
  const activeItemId = currentDocumentId ?? null;
  const activeItem =
    checklistItems.find((item) => item.id === activeItemId) ?? null;
  const activeDocuments = activeItem
    ? uploadedDocuments.filter(
        (document) => document.checklist_item_id === activeItem.id
      )
    : [];

  function handleUploaded(document: UploadedDocument) {
    setUploadedDocuments((current) => [
      document,
      ...current.filter((currentDocument) => currentDocument.id !== document.id)
    ]);
  }

  return (
    <div className="section-stack upload-portal">
      {error ? <div className="alert error">{error}</div> : null}
      {success ? <div className="alert success">{success}</div> : null}
      <div className="panel upload-hero">
        <div>
          <h1>Upload documents</h1>
          <p className="lead">Hi {studentName}, choose a document to begin.</p>
        </div>
      </div>
      {activeItem ? (
        <DocumentCaptureWizard
          token={token}
          baseHref={baseHref}
          item={activeItem}
          documents={activeDocuments}
          onUploaded={handleUploaded}
        />
      ) : (
        <DocumentTaskList
          baseHref={baseHref}
          items={checklistItems}
          documents={uploadedDocuments}
          activeItemId={activeItemId}
        />
      )}
    </div>
  );
}
