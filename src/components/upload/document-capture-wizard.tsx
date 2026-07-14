"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CaptureStep } from "./capture-step";
import type { ChecklistItem, UploadedDocument, UploadStep } from "./types";
import {
  buildUploadSteps,
  documentProgress,
  documentsForStep,
  formatList,
  newestDocument,
  studentDocumentRequestHint,
  studentDocumentRequirementLabel,
  studentDocumentRequirementTone
} from "./upload-utils";

function firstOpenStepIndex(
  item: ChecklistItem,
  steps: UploadStep[],
  documents: UploadedDocument[]
) {
  const requiredMissing = steps.findIndex(
    (step) => step.isRequired && documentsForStep(documents, item, step).length === 0
  );

  if (requiredMissing >= 0) {
    return requiredMissing;
  }

  const optionalMissing = steps.findIndex(
    (step) => !step.isRequired && documentsForStep(documents, item, step).length === 0
  );

  return optionalMissing >= 0 ? optionalMissing : -1;
}

export function DocumentCaptureWizard({
  token,
  baseHref,
  item,
  documents,
  onUploaded
}: {
  token: string;
  baseHref: string;
  item: ChecklistItem;
  documents: UploadedDocument[];
  onUploaded: (document: UploadedDocument) => void;
}) {
  const steps = useMemo(() => buildUploadSteps(item), [item]);
  const [manualStepIndex, setManualStepIndex] = useState<number | null>(null);
  const autoStepIndex = firstOpenStepIndex(item, steps, documents);
  const activeStepIndex = manualStepIndex ?? autoStepIndex;
  const progress = documentProgress(item, documents);
  const activeStep =
    item.upload_type === "multiple"
      ? steps[0]
      : activeStepIndex >= 0
        ? steps[activeStepIndex]
        : null;
  const isReview = item.upload_type !== "multiple" && !activeStep;

  function moveToNextStep(nextDocuments: UploadedDocument[]) {
    if (item.upload_type === "multiple") {
      return;
    }

    const nextIndex = steps.findIndex((step, index) => {
      if (index <= activeStepIndex) {
        return false;
      }

      return documentsForStep(nextDocuments, item, step).length === 0;
    });

    window.setTimeout(() => {
      setManualStepIndex(nextIndex >= 0 ? nextIndex : -1);
    }, 900);
  }

  function handleUploaded(document: UploadedDocument, shouldAdvance: boolean) {
    onUploaded(document);
    const nextDocuments = [document, ...documents];

    if (shouldAdvance) {
      moveToNextStep(nextDocuments);
      return;
    }

    setManualStepIndex(activeStepIndex);
  }

  function skipOptionalStep() {
    const nextDocuments = documents;
    const nextIndex = steps.findIndex((step, index) => {
      if (index <= activeStepIndex) {
        return false;
      }

      return documentsForStep(nextDocuments, item, step).length === 0;
    });

    setManualStepIndex(nextIndex >= 0 ? nextIndex : -1);
  }

  return (
    <section className="panel capture-wizard">
      <div className="capture-wizard-top">
        <Link className="button secondary" href={baseHref}>
          Back to documents
        </Link>
        <div className="button-row">
          <span className={`chip ${studentDocumentRequirementTone(item)}`}>
            {studentDocumentRequirementLabel(item)}
          </span>
          <span className="chip info">{formatList(item.accepted_formats)}</span>
        </div>
      </div>
      <div>
        <h1>{item.document_name}</h1>
        <p className="lead">{item.instructions || "Upload a clear file."}</p>
        {studentDocumentRequestHint(item) ? (
          <p className="muted">{studentDocumentRequestHint(item)}</p>
        ) : null}
      </div>
      {item.upload_type === "multi_part" ? (
        <ol className="wizard-steps" aria-label={`${item.document_name} upload steps`}>
          {steps.map((step, index) => {
            const latest = newestDocument(documentsForStep(documents, item, step));
            const isActive = activeStepIndex === index;

            return (
              <li className={isActive ? "active" : ""} key={step.id}>
                <span>{latest ? "✓" : index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>
                    {latest
                      ? "Uploaded"
                      : isActive
                        ? "Next to capture"
                      : step.isRequired
                        ? "Required"
                        : "Optional"}
                  </small>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {item.upload_type === "multiple" ? (
        <div className="section-stack">
          <CaptureStep
            key={`${item.id}-multiple`}
            token={token}
            item={item}
            step={steps[0]}
            documents={[]}
            onUploaded={(document) => onUploaded(document)}
          />
          {documents.length ? (
            <div className="uploaded-file-list">
              <strong>Uploaded files</strong>
              {documents.map((document) => (
                <span key={document.id}>{document.original_filename}</span>
              ))}
            </div>
          ) : null}
          <Link className="button" href={baseHref}>
            Done
          </Link>
        </div>
      ) : activeStep ? (
        <div className="section-stack">
          {!activeStep.isRequired ? (
            <div className="alert info">
              Do you want to add {activeStep.label.toLowerCase()}?
            </div>
          ) : null}
          <CaptureStep
            key={activeStep.id}
            token={token}
            item={item}
            step={activeStep}
            documents={documentsForStep(documents, item, activeStep)}
            stepIndex={item.upload_type === "multi_part" ? activeStepIndex : undefined}
            totalSteps={item.upload_type === "multi_part" ? steps.length : undefined}
            onUploaded={handleUploaded}
          />
          {!activeStep.isRequired ? (
            <button className="button secondary" type="button" onClick={skipOptionalStep}>
              Skip
            </button>
          ) : null}
        </div>
      ) : isReview ? (
        <div className="document-complete-panel">
          <span className="chip success">
            {progress.status === "Accepted" ? "Accepted" : "Submitted"}
          </span>
          <h2>{item.document_name} is complete</h2>
          <p className="muted">
            {item.document_name} uploaded successfully. The counselor can now review the files.
          </p>
          <Link className="button" href={baseHref}>
            Submit document
          </Link>
        </div>
      ) : null}
    </section>
  );
}
