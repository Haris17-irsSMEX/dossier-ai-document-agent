"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { DocumentCaptureWizard } from "./document-capture-wizard";
import { DocumentTaskList } from "./document-task-list";
import type { ChecklistItem, UploadedDocument } from "./types";
import { documentProgress } from "./upload-utils";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { isActiveChecklistRequest } from "@/lib/checklists/request-logic";

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
  const requestedItems = checklistItems.filter(isActiveChecklistRequest);
  const completedItems = requestedItems.filter(
    (item) => documentProgress(item, uploadedDocuments).isComplete
  ).length;
  const completion = requestedItems.length
    ? Math.round((completedItems / requestedItems.length) * 100)
    : 0;

  function handleUploaded(document: UploadedDocument) {
    setUploadedDocuments((current) => [
      document,
      ...current.filter((currentDocument) => currentDocument.id !== document.id)
    ]);
  }

  return (
    <div className="section-stack upload-portal">
      <header className="public-upload-header">
        <div className="public-brand">
          <span className="public-brand-mark">D</span>
          <span>
            <strong>{APP_NAME}</strong>
            <small>{APP_TAGLINE}</small>
          </span>
        </div>
        <span className="chip info">Secure upload</span>
      </header>
      {error ? <div className="alert error">{error}</div> : null}
      {success ? <div className="alert success">{success}</div> : null}
      <div className="panel upload-hero">
        <div>
          <span className="eyebrow">Secure document upload</span>
          <h1>Hi {studentName}</h1>
          <p className="lead">Choose a requested document to begin.</p>
        </div>
        <div className="upload-progress-summary">
          <strong>{completion}%</strong>
          <span>
            {completedItems} of {requestedItems.length} requested documents
          </span>
          <div className="progress-track" aria-label={`${completion}% complete`}>
            <span style={{ width: `${completion}%` }} />
          </div>
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
      <div className="upload-trust-note">
        <ShieldCheck aria-hidden="true" size={17} />
        Your documents are uploaded securely for your consultant.
      </div>
    </div>
  );
}
