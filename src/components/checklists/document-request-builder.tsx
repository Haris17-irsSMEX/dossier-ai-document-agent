import {
  Archive,
  Eye,
  EyeOff,
  FileText,
  Plus,
  SlidersHorizontal
} from "lucide-react";
import Link from "next/link";

import {
  activateChecklistItemAction,
  archiveChecklistItemAction,
  markChecklistItemNotNeededAction
} from "@/lib/actions/checklists";
import {
  CHECKLIST_PHASES,
  getChecklistPhase
} from "@/lib/checklists/phases";
import { CustomDocumentRequestForm } from "@/components/checklists/custom-document-request-form";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentRequestForm } from "@/components/checklists/document-request-form";
import {
  isActiveChecklistRequest,
  isAvailableLater,
  isChecklistReady,
  isMissingActiveRequest,
  isRequested,
  requirementLevel
} from "@/lib/checklists/request-logic";

type ChecklistItem = Parameters<typeof DocumentRequestForm>[0]["item"] & {
  status: string;
  phase_label?: string | null;
  phase_order?: number | null;
  item_order?: number | null;
  is_custom?: boolean | null;
};

function requirementTone(level: string) {
  if (level === "required") return "danger";
  if (level === "conditional") return "warning";
  return "";
}

export function DocumentRequestBuilder({
  studentId,
  items,
  caseStage
}: {
  studentId: string;
  items: ChecklistItem[];
  caseStage?: string | null;
}) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <strong>No checklist items</strong>
        <p>Generate a smart checklist or add a custom document request.</p>
        <details className="custom-request-disclosure">
          <summary className="button">
            <Plus aria-hidden="true" size={16} />
            Add document request
          </summary>
          <div className="panel compact">
            <CustomDocumentRequestForm studentId={studentId} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="phase-builder">
      {CHECKLIST_PHASES.map((phase) => {
        const phaseItems = items
          .filter((item) => getChecklistPhase(item.phase_slug).slug === phase.slug)
          .sort(
            (left, right) =>
              (left.item_order ?? 999) - (right.item_order ?? 999)
          );
        const ready = phaseItems.filter(
          (item) => isActiveChecklistRequest(item) && isChecklistReady(item)
        ).length;
        const required = phaseItems.filter(
          (item) =>
            requirementLevel(item) === "required" &&
            isActiveChecklistRequest(item)
        ).length;
        const missing = phaseItems.filter(isMissingActiveRequest).length;
        const conditional = phaseItems.filter(
          (item) =>
            requirementLevel(item) === "conditional" && !isRequested(item)
        ).length;
        const optional = phaseItems.filter(
          (item) => requirementLevel(item) === "optional"
        ).length;
        const activeCount = phaseItems.filter(isActiveChecklistRequest).length;

        return (
          <details
            className={`phase-card phase-${phase.accent}`}
            key={phase.slug}
            open={phase.slug === "profile_academic_file"}
          >
            <summary className="phase-card-summary">
              <span className="phase-icon">
                <FileText aria-hidden="true" size={17} />
              </span>
              <span className="phase-heading-copy">
                <strong>{phase.label}</strong>
                <small>{phase.description}</small>
              </span>
              <span className="phase-counts">
                {required ? <span>{required} required</span> : null}
                {missing ? <span>{missing} missing</span> : null}
                {conditional ? <span>{conditional} conditional</span> : null}
                {optional ? <span>{optional} optional</span> : null}
                {ready ? <span>{ready} ready</span> : null}
              </span>
            </summary>
            <div className="phase-card-body">
              {phaseItems.length && !activeCount ? (
                <div className="phase-stage-note">
                  {phase.slug === "admission_offer_stage"
                    ? "Available after admission or when requested."
                    : phase.slug === "visa_processing"
                      ? "Available after offer or admission, or when requested."
                      : phase.slug === "pre_departure"
                        ? "Available after visa approval or when requested."
                        : "No active requests in this phase yet. Activate a document when it is needed."}
                </div>
              ) : null}
              {phaseItems.length ? (
                <div className="phase-request-list">
                  {phaseItems.map((item) => {
                    const requirement = requirementLevel(item);
                    const requested = isRequested(item);
                    const availableLater = isAvailableLater(item, caseStage);

                    return (
                      <article className="phase-request-row" key={item.id}>
                        <div className="phase-request-main">
                          <div className="phase-request-title">
                            <strong>{item.document_name}</strong>
                            <span className={`chip ${requirementTone(requirement)}`}>
                              {requirement}
                            </span>
                            {requested ? (
                              <>
                                {requirement !== "required" ? (
                                  <span className="chip info">Requested</span>
                                ) : null}
                                <DocumentStatusBadge status={item.status} />
                              </>
                            ) : (
                              <span className={`chip ${availableLater ? "info" : ""}`}>
                                {availableLater ? "Available later" : "Not requested"}
                              </span>
                            )}
                          </div>
                          <p>
                            {item.instructions || "No upload instructions added."}
                          </p>
                          <div className="phase-request-meta">
                            <span>{item.upload_type.replaceAll("_", " ")}</span>
                            <span>{item.accepted_formats.join(", ").toUpperCase()}</span>
                            <span>
                              {item.visible_to_student === false ? (
                                <EyeOff aria-hidden="true" size={13} />
                              ) : (
                                <Eye aria-hidden="true" size={13} />
                              )}
                              {item.visible_to_student === false
                                ? "Counselor only"
                                : "Visible to student"}
                            </span>
                            {item.is_custom ? <span>Custom request</span> : null}
                          </div>
                        </div>
                        <div className="phase-request-actions">
                          {!requested ? (
                            <form action={activateChecklistItemAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input
                                type="hidden"
                                name="student_id"
                                value={item.student_id}
                              />
                              <button className="button compact-button" type="submit">
                                Request from student
                              </button>
                            </form>
                          ) : requirement !== "required" ? (
                            <form action={markChecklistItemNotNeededAction}>
                              <input type="hidden" name="id" value={item.id} />
                              <input
                                type="hidden"
                                name="student_id"
                                value={item.student_id}
                              />
                              <button
                                className="button secondary compact-button"
                                type="submit"
                              >
                                Mark as not needed
                              </button>
                            </form>
                          ) : null}
                          <Link
                            className="button secondary compact-button"
                            href={`/students/${studentId}/documents`}
                          >
                            <FileText aria-hidden="true" size={15} />
                            View uploads
                          </Link>
                          <details className="request-editor-disclosure">
                            <summary className="button secondary compact-button">
                              <SlidersHorizontal aria-hidden="true" size={15} />
                              Edit
                            </summary>
                            <div className="request-editor-panel">
                              <DocumentRequestForm item={item} />
                            </div>
                          </details>
                          <form action={archiveChecklistItemAction}>
                            <input type="hidden" name="id" value={item.id} />
                            <input
                              type="hidden"
                              name="student_id"
                              value={item.student_id}
                            />
                            <button
                              className="button ghost-danger compact-button"
                              type="submit"
                            >
                              <Archive aria-hidden="true" size={15} />
                              Archive
                            </button>
                          </form>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="phase-empty">
                  <strong>No active requests in this phase yet.</strong>
                  <span>
                    {phase.slug === "admission_offer_stage"
                      ? "Available after admission or when requested."
                      : phase.slug === "visa_processing"
                        ? "Available after offer or admission, or when requested."
                        : phase.slug === "pre_departure"
                          ? "Available after visa approval or when requested."
                          : "Add documents here when the case reaches this stage."}
                  </span>
                </div>
              )}
              <details className="custom-request-disclosure">
                <summary className="button secondary compact-button">
                  <Plus aria-hidden="true" size={15} />
                  Add document in this phase
                </summary>
                <div className="custom-request-panel">
                  <CustomDocumentRequestForm
                    defaultPhaseSlug={phase.slug}
                    studentId={studentId}
                  />
                </div>
              </details>
            </div>
          </details>
        );
      })}
    </div>
  );
}
