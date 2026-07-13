import { formatDate } from "@/lib/date";
import {
  isMissingActiveRequest
} from "@/lib/checklists/request-logic";
import { formatEducationBackgroundDisplay } from "@/lib/students/education-background";
import type { ExportPacketPreview } from "@/lib/export/create-packet";

export function ExportSummary({ preview }: { preview: ExportPacketPreview }) {
  const student = preview.student;
  const requestedMissing = preview.checklistItems.filter(isMissingActiveRequest);
  const requestedItems = preview.checklistItems;
  const destinationSummary = [
    student.target_country || student.destination_country || "-",
    student.intake || "-",
    student.program_level || "-"
  ].join(" · ");
  const uploadedCount = preview.documents.length;
  const educationBackground =
    formatEducationBackgroundDisplay(student.education_background) || "-";

  const readiness =
    requestedItems.length === 0
      ? {
          tone: "archived" as const,
          title: "No documents requested yet.",
          detail: "Request documents from the Checklist before exporting."
        }
      : requestedMissing.length > 0
        ? {
            tone: "warning" as const,
            title: "Requested documents are still missing.",
            detail: requestedMissing.map((item) => item.document_name).join(", ")
          }
        : preview.completion.problemDocuments > 0 || preview.completion.complete < preview.completion.total
          ? {
              tone: "warning" as const,
              title: "Some uploaded files need review before export.",
              detail: `${preview.completion.problemDocuments} problem file${preview.completion.problemDocuments === 1 ? "" : "s"}`
            }
          : {
              tone: "success" as const,
              title: "Packet looks ready to export.",
              detail: null
            };

  return (
    <section className="panel section-stack">
      <div className="section-title">
        <div>
          <h2>Student file summary</h2>
          <p>{destinationSummary}</p>
        </div>
        <span className="chip info">{preview.completion.complete}/{preview.completion.total} ready</span>
      </div>
      <div className="reminder-setup-grid export-summary-grid">
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Student</span>
          <strong>{student.full_name}</strong>
        </div>
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Destination</span>
          <strong>{destinationSummary}</strong>
        </div>
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Education</span>
          <strong>{educationBackground}</strong>
        </div>
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Deadline</span>
          <strong>{formatDate(student.deadline_date) || student.deadline_date || "-"}</strong>
        </div>
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Progress</span>
          <strong>{preview.completion.complete}/{preview.completion.total} ready</strong>
        </div>
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Files</span>
          <strong>{uploadedCount} uploaded</strong>
        </div>
        <div className="reminder-setup-item">
          <span className="reminder-setup-label">Issues</span>
          <strong>{preview.completion.problemDocuments} problem file{preview.completion.problemDocuments === 1 ? "" : "s"}</strong>
        </div>
      </div>
      <div className={`export-readiness-note ${readiness.tone}`}>
        <strong>{readiness.title}</strong>
        {readiness.detail ? <p>{readiness.detail}</p> : null}
      </div>
    </section>
  );
}
