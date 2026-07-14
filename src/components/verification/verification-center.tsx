"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addManualVerificationWorkflow,
  refreshVerificationSuggestions,
  upsertVerificationWorkflow
} from "@/lib/actions/verification";
import { formatDateTime } from "@/lib/date";
import {
  boardOptions,
  counselorVerificationStatuses,
  defaultProviderPortalUrls,
  providerDetails,
  safeExternalUrl,
  statusLabels,
  verificationProviders,
  type VerificationProvider,
  type VerificationWorkflow,
  type VerificationWorkflowStatus
} from "@/lib/verification/manual-verification";

type Feedback = {
  tone: "success" | "error";
  message: string;
};

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

function statusIcon(status: VerificationWorkflowStatus) {
  switch (status) {
    case "verified":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "issue_found":
      return <AlertTriangle size={15} aria-hidden="true" />;
    case "not_required":
      return <Ban size={15} aria-hidden="true" />;
    default:
      return null;
  }
}

function workflowPortalUrl(
  provider: VerificationProvider,
  customUrl?: string | null
) {
  return (
    safeExternalUrl(customUrl) ||
    safeExternalUrl(defaultProviderPortalUrls[provider])
  );
}

function portalUnavailableText(
  provider: VerificationProvider,
  selectedBoard?: string
) {
  if (provider === "board") {
    return selectedBoard
      ? "Portal not configured. Use manual verification and save notes."
      : "Select a board in details, or use manual verification and save notes.";
  }

  return "Add a portal link in details if you want to open it from Dossier.";
}

function relatedDocumentText(workflow: VerificationWorkflow) {
  if (!workflow.related_documents.length) {
    return "Added manually";
  }

  return workflow.related_documents
    .map((document) => document.document_name)
    .join(", ");
}

function WorkflowCard({ workflow }: { workflow: VerificationWorkflow }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<VerificationWorkflowStatus>(
    workflow.status
  );
  const [referenceNumber, setReferenceNumber] = useState(
    workflow.reference_number || ""
  );
  const [selectedBoard, setSelectedBoard] = useState(
    workflow.selected_board || ""
  );
  const [officialUrl, setOfficialUrl] = useState(workflow.official_url || "");
  const [evidenceUrl, setEvidenceUrl] = useState(workflow.evidence_url || "");
  const [notes, setNotes] = useState(workflow.notes || "");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const details = providerDetails[workflow.provider];
  const openUrl = workflowPortalUrl(workflow.provider, officialUrl);
  const isNotRequired = status === "not_required";

  function saveWorkflow(nextStatus = status) {
    setFeedback(null);
    startTransition(async () => {
      const result = await upsertVerificationWorkflow({
        id: workflow.id,
        studentId: workflow.student_id,
        provider: workflow.provider,
        providerLabel: workflow.provider_label,
        status: nextStatus,
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

      setStatus(nextStatus);
      setFeedback({ tone: "success", message: result.message });
      router.refresh();
    });
  }

  function quickStatus(nextStatus: VerificationWorkflowStatus, openDetails = false) {
    setStatus(nextStatus);
    if (openDetails) {
      setIsOpen(true);
    }
    saveWorkflow(nextStatus);
  }

  function recordPortalOpened() {
    if (status === "not_started") {
      quickStatus("portal_opened");
    }
  }

  return (
    <section
      className={`panel verification-workflow-card ${
        isNotRequired ? "is-not-required" : ""
      }`}
    >
      <div className="verification-workflow-header">
        <div className="verification-workflow-copy">
          <div className="verification-workflow-title-row">
            <h2>{workflow.provider_label}</h2>
            <span className={`chip ${statusTone(status)} verification-status-chip`}>
              {statusIcon(status)}
              {statusLabels[status]}
            </span>
          </div>
          <p>{details.description}</p>
          <div className="verification-related-documents">
            <span>Related documents</span>
            <strong>{relatedDocumentText(workflow)}</strong>
          </div>
          <div className="verification-card-meta">
            {referenceNumber ? <span>Reference: {referenceNumber}</span> : null}
            {workflow.provider === "board" && selectedBoard ? (
              <span>Board: {selectedBoard}</span>
            ) : null}
            <span>Updated {formatDateTime(workflow.updated_at) || "recently"}</span>
          </div>
        </div>
      </div>

      <div className="verification-card-actions">
        {openUrl ? (
          <a
            className="button secondary"
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={recordPortalOpened}
          >
            <ExternalLink size={16} aria-hidden="true" />
            {details.portalButtonLabel}
          </a>
        ) : (
          <button className="button secondary" type="button" disabled>
            <ExternalLink size={16} aria-hidden="true" />
            {details.portalButtonLabel}
          </button>
        )}
        <button
          className="button"
          type="button"
          disabled={isPending || status === "verified"}
          onClick={() => quickStatus("verified")}
        >
          Mark verified
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={isPending || status === "issue_found"}
          onClick={() => quickStatus("issue_found", true)}
        >
          Mark issue found
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={isPending || isNotRequired}
          onClick={() => quickStatus("not_required")}
        >
          Mark not required
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? "Close details" : "Details / Add evidence"}
        </button>
      </div>

      {!openUrl ? (
        <p className="verification-portal-note">
          {portalUnavailableText(workflow.provider, selectedBoard)}
        </p>
      ) : null}

      {isOpen ? (
        <div className="verification-editor">
          <div className="form-grid two">
            <label>
              Status
              <select
                value={
                  status === "portal_opened" || status === "submitted"
                    ? "in_progress"
                    : status
                }
                onChange={(event) =>
                  setStatus(event.target.value as VerificationWorkflowStatus)
                }
              >
                {counselorVerificationStatuses.map((option) => (
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
                Select board
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
            <label className={workflow.provider === "board" ? "" : "span-2"}>
              Portal link (optional)
              <input
                value={officialUrl}
                onChange={(event) => setOfficialUrl(event.target.value)}
                placeholder="Paste an official portal link"
                inputMode="url"
              />
            </label>
            <label className="span-2">
              Evidence / proof note or link
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
              onClick={() => saveWorkflow()}
            >
              {isPending ? "Saving..." : "Save verification"}
            </button>
          </div>
        </div>
      ) : feedback ? (
        <div className={`alert compact-alert ${feedback.tone}`}>
          {feedback.message}
        </div>
      ) : null}
    </section>
  );
}

function RefreshSuggestions({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function refresh() {
    setFeedback(null);
    startTransition(async () => {
      const result = await refreshVerificationSuggestions(studentId);

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message });
      router.refresh();
    });
  }

  return (
    <div className="verification-refresh-area">
      <button
        className="button secondary"
        type="button"
        disabled={isPending}
        onClick={refresh}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {isPending ? "Refreshing..." : "Refresh suggestions"}
      </button>
      {feedback ? (
        <span className={`verification-inline-feedback ${feedback.tone}`}>
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}

function AddManualVerification({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [provider, setProvider] = useState<VerificationProvider>("nadra");
  const [providerLabel, setProviderLabel] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

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
      needed: workflows.filter((workflow) => workflow.status !== "not_required")
        .length,
      inProgress: workflows.filter((workflow) =>
        ["portal_opened", "submitted", "in_progress"].includes(workflow.status)
      ).length,
      verified: workflows.filter((workflow) => workflow.status === "verified")
        .length,
      issues: workflows.filter((workflow) => workflow.status === "issue_found")
        .length
    }),
    [workflows]
  );

  const activeWorkflows = workflows.filter(
    (workflow) => workflow.status !== "not_required"
  );
  const notRequiredWorkflows = workflows.filter(
    (workflow) => workflow.status === "not_required"
  );

  return (
    <div className="section-stack">
      <section className="panel verification-guidance-panel">
        <div>
          <strong>Manual verification tracker</strong>
          <p>
            Dossier does not verify government records directly. Use the
            official portal or manual process, then save the result here.
          </p>
        </div>
        <RefreshSuggestions studentId={studentId} />
      </section>

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
          {activeWorkflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
          {notRequiredWorkflows.length ? (
            <div className="verification-not-required-group">
              <h3>Not required</h3>
              {notRequiredWorkflows.map((workflow) => (
                <WorkflowCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          ) : null}
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
