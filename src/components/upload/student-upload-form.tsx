import { UploadPortal } from "./upload-portal";
import type { ChecklistItem, UploadedDocument } from "./types";

export function StudentUploadForm({
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
  return (
    <UploadPortal
      token={token}
      studentName={studentName}
      checklistItems={checklistItems}
      documents={documents}
      error={error}
      success={success}
      currentDocumentId={currentDocumentId}
    />
  );
}
