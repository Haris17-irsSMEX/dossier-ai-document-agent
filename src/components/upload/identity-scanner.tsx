"use client";

import { useEffect, useState } from "react";

import { CameraCapture } from "./camera-capture";
import { FilePreview } from "./file-preview";
import { ScanFeedback } from "./scan-feedback";
import { ScanQualityCheck, analyzeImageQuality, type QualityResult } from "./scan-quality-check";
import { ScanStepHeader } from "./scan-step-header";
import type {
  ChecklistItem,
  UploadedDocument,
  UploadStep,
  WizardState
} from "./types";
import {
  newestDocument,
  requiresStudentDecision,
  uploadDocumentRequest
} from "./upload-utils";

function shouldRetake(status?: string | null) {
  return status === "blurry" || status === "wrong_document";
}

export function IdentityScanner({
  token,
  item,
  step,
  stepIndex,
  totalSteps,
  documents,
  onUploaded
}: {
  token: string;
  item: ChecklistItem;
  step: UploadStep;
  stepIndex: number;
  totalSteps: number;
  documents: UploadedDocument[];
  onUploaded: (document: UploadedDocument, shouldAdvance: boolean) => void;
}) {
  const latest = newestDocument(documents);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [state, setState] = useState<WizardState>(latest ? "step_complete" : "opening_camera");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    latest?.status || latest?.scan_status || null
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<UploadedDocument | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleCapture(file: File) {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setCapturedFile(file);
    setPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setQualityResult(null);
    setUploadError(null);
    setMessage("Photo selected.");
    setStatus(null);
    setState("checking_quality");

    if (!file.type.startsWith("image/")) {
      setState("captured");
      setMessage("File selected. Confirm upload to continue.");
      return;
    }

    try {
      const result = await analyzeImageQuality(file);

      setQualityResult(result);
      setState(result.ok ? "captured" : "retake_required");
      setMessage(result.message);
    } catch (error) {
      console.error("[identity-scanner] quality check failed", error);
      setState("captured");
      setMessage("Photo captured. You can use this photo or retake it.");
    }
  }

  function retake() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setCapturedFile(null);
    setPreviewUrl(null);
    setQualityResult(null);
    setUploadError(null);
    setMessage(null);
    setStatus(null);
    setLastUploaded(null);
    setState("opening_camera");
  }

  async function uploadCapturedPhoto() {
    if (!capturedFile) {
      return;
    }

    const formData = new FormData();
    formData.append("file", capturedFile);
    formData.append("token", token);
    formData.append("checklistItemId", item.id);

    if (step.part?.id) {
      formData.append("documentPartId", step.part.id);
    }

    setState("uploading");
    setUploadError(null);
    setMessage("Uploading...");

    const scanTimer = window.setTimeout(() => {
      setState("scanning");
      setMessage("Scanning...");
    }, 700);

    try {
      const { response, result } = await uploadDocumentRequest(formData);

      window.clearTimeout(scanTimer);

      if (!response.ok || !result.ok) {
        const errorMessage =
          "error" in result ? result.error : "Upload failed. Please try again.";
        console.error("[identity-scanner] upload failed", {
          status: response.status,
          message: errorMessage
        });
        setState("captured");
        setUploadError(errorMessage);
        setMessage(null);
        return;
      }

      const uploadedDocument: UploadedDocument = {
        id: result.documentId,
        checklist_item_id: item.id,
        document_part_id: step.part?.id ?? null,
        original_filename: capturedFile.name,
        status: result.documentStatus || "uploaded",
        scan_status: result.scanStatus || "not_scanned",
        created_at: new Date().toISOString()
      };
      const needsDecision = requiresStudentDecision(
        uploadedDocument.status,
        uploadedDocument.scan_status
      );

      setStatus(uploadedDocument.status || uploadedDocument.scan_status || null);
      setMessage(result.scanMessage || result.message || "Uploaded successfully.");
      setState(needsDecision ? "needs_retake" : "step_complete");
      setLastUploaded(uploadedDocument);
      setCapturedFile(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      onUploaded(uploadedDocument, !needsDecision);
    } catch (error) {
      window.clearTimeout(scanTimer);
      console.error("[identity-scanner] upload request failed", error);
      setState("captured");
      setUploadError(
        error instanceof Error
          ? error.message
          : "Upload failed. Check your connection and try again."
      );
      setMessage(null);
    }
  }

  function continueAnyway() {
    const document = lastUploaded || latest;

    if (!document) {
      return;
    }

    onUploaded(document, true);
    setState("step_complete");
    setMessage("Continuing for counselor review.");
  }

  const showCamera =
    !capturedFile &&
    (state === "opening_camera" || state === "ready" || state === "idle");
  const showUsePhoto =
    capturedFile &&
    state !== "uploading" &&
    state !== "scanning" &&
    state !== "step_complete";

  return (
    <div className="identity-scanner">
      <ScanStepHeader
        item={item}
        step={step}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
      />
      {showCamera ? (
        <CameraCapture item={item} step={step} onCapture={handleCapture} />
      ) : null}
      {capturedFile ? (
        <div className="scanner-preview">
          <FilePreview file={capturedFile} previewUrl={previewUrl} />
        </div>
      ) : null}
      <ScanQualityCheck
        result={qualityResult}
        isChecking={state === "checking_quality"}
      />
      {uploadError ? <span className="inline-error">{uploadError}</span> : null}
      <ScanFeedback state={state} message={message} status={status} />
      {showUsePhoto ? (
        <div className="scanner-actions">
          <button className="button secondary" type="button" onClick={retake}>
            Retake
          </button>
          <button className="button" type="button" onClick={uploadCapturedPhoto}>
            {qualityResult?.ok ? "Use photo" : "Continue anyway"}
          </button>
        </div>
      ) : null}
      {state === "needs_retake" ? (
        <div className="scanner-actions">
          <button className="button secondary" type="button" onClick={retake}>
            Retake
          </button>
          <button className="button" type="button" onClick={continueAnyway}>
            Continue anyway
          </button>
        </div>
      ) : null}
      {latest && state === "step_complete" ? (
        <p className="muted">Uploaded: {latest.original_filename}</p>
      ) : null}
      {shouldRetake(status) ? (
        <p className="muted">You can retake this side before moving on.</p>
      ) : null}
    </div>
  );
}
