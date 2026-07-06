import { formatDate } from "@/lib/date";
import { CHECKLIST_PHASES, getChecklistPhase } from "@/lib/checklists/phases";
import {
  isActiveChecklistRequest,
  isMissingActiveRequest,
  isChecklistReady
} from "@/lib/checklists/request-logic";
import type { ExportPacketPreview } from "@/lib/export/create-packet";

export function ExportSummary({ preview }: { preview: ExportPacketPreview }) {
  const student = preview.student;
  const requiredMissing = preview.checklistItems.filter(isMissingActiveRequest);

  return (
    <section className="panel section-stack">
      <div className="section-title">
        <div>
          <h2>Student profile summary</h2>
          <p>
            {student.target_country || student.destination_country || "-"} -{" "}
            {student.intake || "-"} - {student.program_level || "-"}
          </p>
        </div>
        <span className="chip info">{preview.completion.percent}% complete</span>
      </div>
      {requiredMissing.length ? (
        <div className="alert error">
          <strong>Requested documents are still missing</strong>
          <p>
            {requiredMissing.map((item) => item.document_name).join(", ")}
          </p>
        </div>
      ) : null}
      <div className="metrics">
        <div className="metric">
          <strong>{student.phone || "-"}</strong>
          <span>Phone</span>
        </div>
        <div className="metric">
          <strong>{student.sponsor_type || "-"}</strong>
          <span>Sponsor</span>
        </div>
        <div className="metric">
          <strong>{formatDate(student.deadline_date) || student.deadline_date || "-"}</strong>
          <span>Deadline</span>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <strong>{preview.completion.complete}/{preview.completion.total}</strong>
          <span>Checklist complete</span>
        </div>
        <div className="metric">
          <strong>{preview.documents.length}</strong>
          <span>Uploaded files</span>
        </div>
        <div className="metric">
          <strong>{preview.completion.problemDocuments}</strong>
          <span>Problem files</span>
        </div>
      </div>
      <div className="export-phase-summary">
        {CHECKLIST_PHASES.map((phase) => {
          const phaseItems = preview.checklistItems.filter(
            (item) =>
              getChecklistPhase(item.phase_slug).slug === phase.slug &&
              isActiveChecklistRequest(item)
          );

          if (!phaseItems.length) {
            return null;
          }

          const ready = phaseItems.filter(isChecklistReady).length;

          return (
            <div key={phase.slug}>
              <span>{phase.label}</span>
              <strong>{ready}/{phaseItems.length}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
