import {
  generateChecklistAction,
  generateUploadTokenAction
} from "@/lib/actions/checklists";
import { DocumentRequestBuilder } from "@/components/checklists/document-request-builder";
import { UploadLinkCard } from "@/components/checklists/upload-link-card";
import { summarizeChecklist } from "@/lib/checklists/request-logic";

type ChecklistItem = Parameters<typeof DocumentRequestBuilder>[0]["items"][number];

export function ChecklistView({
  studentId,
  studentName,
  items,
  localUploadUrl,
  mobileUploadUrl,
  uploadPath,
  uploadExpiresAt,
  success,
  error,
  caseStage
}: {
  studentId: string;
  studentName: string;
  items: ChecklistItem[];
  localUploadUrl?: string;
  mobileUploadUrl?: string;
  uploadPath?: string;
  uploadExpiresAt?: string;
  success?: string;
  error?: string;
  caseStage?: string | null;
}) {
  const summary = summarizeChecklist(items);

  return (
    <div className="section-stack">
      {success ? <div className="alert success">{success}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}
      {localUploadUrl && mobileUploadUrl && uploadPath ? (
        <UploadLinkCard
          localUploadUrl={localUploadUrl}
          mobileUploadUrl={mobileUploadUrl}
          studentName={studentName}
          uploadPath={uploadPath}
          expiresAt={uploadExpiresAt}
          followUpHref={`/students/${studentId}/follow-up`}
        />
      ) : null}
      <div className="panel">
        <div className="section-title">
          <div>
            <h1>Document request builder</h1>
            <p>Generate a smart checklist, then customize each request.</p>
          </div>
          <div className="button-row">
            <form action={generateChecklistAction}>
              <input type="hidden" name="student_id" value={studentId} />
              <button className="button" type="submit">
                Generate checklist
              </button>
            </form>
            <form action={generateUploadTokenAction}>
              <input type="hidden" name="student_id" value={studentId} />
              <button className="button secondary" type="submit">
                {localUploadUrl ? "Regenerate link" : "Generate upload link"}
              </button>
            </form>
          </div>
        </div>
      </div>
      <section className="checklist-summary-strip" aria-label="Checklist summary">
        {[
          ["Required now", summary.requiredNow],
          ["Missing required", summary.missingRequired],
          ["Conditional available", summary.conditionalAvailable],
          ["Optional available", summary.optionalAvailable],
          ["Uploaded", summary.uploaded],
          ["Needs review", summary.needsReview]
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <DocumentRequestBuilder
        caseStage={caseStage}
        studentId={studentId}
        items={items}
      />
    </div>
  );
}
