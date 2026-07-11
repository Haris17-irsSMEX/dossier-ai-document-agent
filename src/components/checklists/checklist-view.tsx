import {
  generateChecklistAction
} from "@/lib/actions/checklists";
import { DocumentRequestBuilder } from "@/components/checklists/document-request-builder";
import { summarizeChecklist } from "@/lib/checklists/request-logic";

type ChecklistItem = Parameters<typeof DocumentRequestBuilder>[0]["items"][number];

export function ChecklistView({
  studentId,
  items,
  success,
  error,
  caseStage
}: {
  studentId: string;
  items: ChecklistItem[];
  success?: string;
  error?: string;
  caseStage?: string | null;
}) {
  const summary = summarizeChecklist(items);
  const hasPreparedSuggestions = items.length > 0;

  return (
    <div className="section-stack">
      {success ? <div className="alert success">{success}</div> : null}
      {error ? <div className="alert error">{error}</div> : null}
      <div className="panel">
        <div className="section-title">
          <div>
            <h1>Document request builder</h1>
            <p>Select the documents you want to collect from this student.</p>
          </div>
        </div>
      </div>
      {!hasPreparedSuggestions ? (
        <div className="empty-state">
          <strong>Dossier has not prepared suggestions for this student yet.</strong>
          <p>Prepare suggestions, then request only the documents you want the student to upload.</p>
          <div className="button-row">
            <form action={generateChecklistAction}>
              <input type="hidden" name="student_id" value={studentId} />
              <button className="button" type="submit">
                Prepare suggestions
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <section className="checklist-summary-strip" aria-label="Checklist summary">
        {[
          ["Requested from student", summary.requestedFromStudent],
          ["Missing", summary.missing],
          ["Uploaded", summary.uploaded],
          ["Needs review", summary.needsReview],
          ["Ready", summary.ready],
          ["Suggested by Dossier", summary.suggestedByDossier]
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      {hasPreparedSuggestions ? (
        <DocumentRequestBuilder
          caseStage={caseStage}
          studentId={studentId}
          items={items}
        />
      ) : null}
    </div>
  );
}
