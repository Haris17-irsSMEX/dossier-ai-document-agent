"use client";

import { ExternalLink, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addManualVerificationWorkflow,
  markVerificationNotRequired,
  upsertVerificationWorkflow
} from "@/lib/actions/verification";
import { formatDateTime } from "@/lib/date";
import {
  boardOptions,
  providerDetails,
  safeExternalUrl,
  statusLabels,
  verificationProviders,
  verificationWorkflowStatuses,
  type VerificationProvider,
  type VerificationWorkflow,
  type VerificationWorkflowStatus
} from "@/lib/verification/manual-verification";

function statusTone(status: VerificationWorkflowStatus) {
  switch (status) {
    case "verified":
      return "success";
    case "issue_found":
      return "danger";
    case "portal_opened":
    case "submitted":
    case "in_progress":
      return "warning";
    case "not_required":
      return "archived";
    default:
      return "info";
  }
}

function WorkflowCard({ workflow }: { workflow: VerificationWorkflow }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<VerificationWorkflowStatus>(workflow.status);
  const [providerLabel, setProviderLabel] = useState(workflow.provider_label);
  const [referenceNumber, setReferenceNumber] = useState(
    workflow.reference_number || ""
  );
  const [selectedBoard, setSelectedBoard] = useState(workflow.selected_board || "");
  const [officialUrl, setOfficialUrl] = useState(workflow.official_url || "");
  const [evidenceUrl, setEvidenceUrl] = useState(workflow.evidence_url || "");
  const [notes, setNotes] = useState(workflow.notes || "");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const openUrl = safeExternalUrl(officialUrl);

  function saveWorkflow() {
    setFeedback(null);
    startTransition(async () => {
      const result = await upsertVerificationWorkflow({
        id: workflow.id,
        studentId: workflow.student_id,
        provider: workflow.provider,
        providerLabel,
        status,
        referenceNumber,
        selectedBoard,
        officialUrl,
        evidenceUrl,
        notes
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message });
      router.refresh();
    });
  }

  function markNotRequired() {
    setFeedback(null);
    startTransition(async () => {
      const result = await markVerificationNotRequired({
        workflowId: workflow.id,
        studentId: workflow.student_id
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setStatus("not_required");
      setFeedback({ tone: "success", message: result.message });
      router.refresh();
    });
  }

  return (
    <section className="panel verification-workflow-card">
      <div className="verification-workflow-header">
        <div className="verification-workflow-copy">
          <div className="verification-workflow-title-row">
            <h2>{workflow.provider_label}</h2>
            <span className={`chip ${statusTone(workflow.status)}`}>
              {statusLabels[workflow.status]}
            </span>
          </div>
          <p>{providerDetails[workflow.provider].description}</p>
          {workflow.related_documents.length ? (
            <div className="verification-related-documents">
              <span>Related documents</span>
              <strong>
                {workflow.related_documents
                  .map((document) => document.document_name)
                  .join(", ")}
              </strong>
            </div>
          ) : (
            <div className="verification-related-documents">
              <span>Source</span>
              <strong>Added manually</strong>
            </div>
          )}
          <div className="verification-card-meta">
            {workflow.reference_number ? (
              <span>Reference: {workflow.reference_number}</span>
            ) : null}
            <span>Updated {formatDateTime(workflow.updated_at) || "recently"}</span>
          </div>
        </div>
        <button
          className="button secondary verification-details-button"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? "Close details" : "Open details"}
        </button>
      </div>

      {isOpen ? (
        <div className="verification-editor">
          <div className="form-grid two">
            <label>
              Provider label
              <input
                value={providerLabel}
                onChange={(event) => setProviderLabel(event.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as VerificationWorkflowStatus)
                }
              >
                {verificationWorkflowStatuses.map((option) => (
                  <option key={option} value={option}>
                    {statusLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reference / tracking number
              <input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
                placeholder="Enter the official reference"
              />
            </label>
            {workflow.provider === "board" ? (
              <label>
                Board
                <select
                  value={selectedBoard}
                  onChange={(event) => setSelectedBoard(event.target.value)}
                >
                  <option value="">Select board</option>
                  {boardOptions.map((board) => (
                    <option key={board} value={board}>
                      {board}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className={workflow.provider === "board" ? "span-2" : ""}>
              Official portal link
              <input
                value={officialUrl}
                onChange={(event) => setOfficialUrl(event.target.value)}
                placeholder="Paste the official portal URL"
                inputMode="url"
              />
            </label>
            <label className="span-2">
              Evidence / proof link or note
              <input
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
                placeholder="Paste a proof link or record a short evidence note"
              />
            </label>
            <label className="span-2">
              Notes
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Record submission details, follow-up notes, or issues"
              />
            </label>
          </div>
          {feedback ? (
            <div className={`alert ${feedback.tone}`}>{feedback.message}</div>
          ) : null}
          <div className="button-row verification-editor-actions">
            <button
              className="button"
              type="button"
              disabled={isPending}
              onClick={saveWorkflow}
            >
              {isPending ? "Saving..." : "Save verification"}
            </button>
            {openUrl ? (
              <a
                className="button secondary"
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={16} aria-hidden="true" />
                Open official portal
              </a>
            ) : null}
            <button
              className="button secondary"
              type="button"
              disabled={isPending || status === "not_required"}
              onClick={markNotRequired}
            >
              Mark not required
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AddManualVerification({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<VerificationProvider>("nadra");
  const [providerLabel, setProviderLabel] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  function addWorkflow() {
    setFeedback(null);
    startTransition(async () => {
      const result = await addManualVerificationWorkflow({
        studentId,
        provider,
        providerLabel
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message });
      router.refresh();
    });
  }

  return (
    <details className="panel compact manual-verification-disclosure">
      <summary>
        <span>
          <Plus size={16} aria-hidden="true" />
          Add manual verification
        </span>
      </summary>
      <div className="manual-verification-form">
        <div className="form-grid two">
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as VerificationProvider)
              }
            >
              {verificationProviders.map((option) => (
                <option key={option} value={option}>
                  {providerDetails[option].label}
                </option>
              ))}
            </select>
          </label>
          {provider === "other" ? (
            <label>
              Verification name
              <input
                value={providerLabel}
                onChange={(event) => setProviderLabel(event.target.value)}
                placeholder="Enter provider or verification name"
              />
            </label>
          ) : (
            <div className="verification-provider-preview">
              <span>Tracking method</span>
              <strong>Manual verification</strong>
            </div>
          )}
        </div>
        {feedback ? (
          <div className={`alert ${feedback.tone}`}>{feedback.message}</div>
        ) : null}
        <button
          className="button secondary"
          type="button"
          disabled={isPending}
          onClick={addWorkflow}
        >
          {isPending ? "Adding..." : "Add verification"}
        </button>
      </div>
    </details>
  );
}

export function VerificationCenter({
  studentId,
  workflows
}: {
  studentId: string;
  workflows: VerificationWorkflow[];
}) {
  const summary = useMemo(
    () => ({
      needed: workflows.filter((workflow) => workflow.status !== "not_required").length,
      inProgress: workflows.filter((workflow) =>
        ["portal_opened", "submitted", "in_progress"].includes(workflow.status)
      ).length,
      verified: workflows.filter((workflow) => workflow.status === "verified").length,
      issues: workflows.filter((workflow) => workflow.status === "issue_found").length
    }),
    [workflows]
  );

  return (
    <div className="section-stack">
      <section className="panel reminder-setup-bar verification-summary-bar">
        <div className="reminder-setup-heading">
          <h2>Verification progress</h2>
        </div>
        <div className="reminder-setup-grid">
          <div className="reminder-setup-item">
            <span className="reminder-setup-label">Needed</span>
            <strong>{summary.needed}</strong>
          </div>
          <div className="reminder-setup-item">
            <span className="reminder-setup-label">In progress</span>
            <strong>{summary.inProgress}</strong>
          </div>
          <div className="reminder-setup-item">
            <span className="reminder-setup-label">Verified</span>
            <strong>{summary.verified}</strong>
          </div>
          <div className="reminder-setup-item">
            <span className="reminder-setup-label">Issues</span>
            <strong>{summary.issues}</strong>
          </div>
        </div>
      </section>

      {workflows.length ? (
        <div className="verification-workflow-list">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      ) : (
        <section className="panel">
          <div className="empty-state compact-empty">
            <strong>No verification steps are needed yet.</strong>
            <p>
              Verification workflows will appear when you request documents that
              require manual verification.
            </p>
          </div>
        </section>
      )}

      <AddManualVerification studentId={studentId} />
    </div>
  );
}
