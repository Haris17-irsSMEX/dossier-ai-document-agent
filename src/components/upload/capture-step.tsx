"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

import { FilePreview } from "./file-preview";
import { ScanFeedback } from "./scan-feedback";
import {
  ScanQualityCheck,
  analyzeImageQuality,
  type QualityResult
} from "./scan-quality-check";
import type {
  ChecklistItem,
  UploadedDocument,
  UploadStep,
  WizardState
} from "./types";
import {
  canPreviewClientFile,
  feedbackForDocument,
  filePickerAcceptValue,
  isAcceptedClientFile,
  MAX_UPLOAD_BYTES,
  nativeCaptureAcceptValue,
  newestDocument,
  supportsCamera,
  studentDocumentRequestHint,
  studentStepRequirementLabel,
  uploadDocumentRequest
} from "./upload-utils";

function shouldRetake(status?: string | null) {
  return status === "blurry" || status === "wrong_document";
}

function shouldAskStudentToRetake(status?: string | null, scanStatus?: string | null) {
  return shouldRetake(status) && scanStatus !== "scan_failed";
}

export function CaptureStep({
  token,
  item,
  step,
  documents,
  stepIndex,
  totalSteps,
  onUploaded
}: {
  token: string;
  item: ChecklistItem;
  step: UploadStep;
  documents: UploadedDocument[];
  stepIndex?: number;
  totalSteps?: number;
  onUploaded: (document: UploadedDocument, shouldAdvance: boolean) => void;
}) {
  const latest = newestDocument(documents);
  const [state, setState] = useState<WizardState>(
    latest ? "step_complete" : "idle"
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    feedbackForDocument(latest)
  );
  const [status, setStatus] = useState<string | null>(
    latest?.status || latest?.scan_status || null
  );
  const [lastUploaded, setLastUploaded] = useState<UploadedDocument | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const cameraEnabled = supportsCamera(item.accepted_formats);
  const requestHint = studentDocumentRequestHint(item);
  const fileInputAccept = filePickerAcceptValue(item.accepted_formats);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedFile(null);
    setFileError(null);
    setUploadError(null);
    setQualityResult(null);
    setQualityWarning(null);
    setMessage(null);
    setStatus(null);
    setState("selecting_file");

    if (!file) {
      setState(latest ? "step_complete" : "idle");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError("File is too large. Upload a file up to 20 MB.");
      return;
    }

    if (!isAcceptedClientFile(file, item.accepted_formats)) {
      setFileError(
        `Upload ${item.accepted_formats.map((value) => value.toUpperCase()).join(", ")} only.`
      );
      return;
    }

    setSelectedFile(file);
    setState("preview");

    if (canPreviewClientFile(file)) {
      setPreviewUrl(URL.createObjectURL(file));
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (["heic", "heif"].includes(extension) || ["image/heic", "image/heif"].includes(file.type.toLowerCase())) {
      setQualityWarning(
        "HEIC uploaded. Manual review may be needed. JPG or PDF is preferred."
      );
      return;
    }

    if (file.type.startsWith("image/") && canPreviewClientFile(file)) {
      setState("checking_quality");
      setMessage("Checking image quality...");

      analyzeImageQuality(file)
        .then((result) => {
          setQualityResult(result);
          setQualityWarning(result.ok ? null : result.message);
          setState("preview");
          setMessage(result.ok ? "Image looks clear enough to upload." : result.message);
        })
        .catch((error) => {
          console.error("[capture-step] quality check failed", error);
          setState("preview");
          setMessage("Quality check could not run. You can still upload this file.");
        });
    }
  }

  function clearSelectedFile() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    setSelectedFile(null);
    setFileError(null);
    setUploadError(null);
    setQualityResult(null);
    setQualityWarning(null);
    setMessage(null);
    setStatus(null);
    setState(latest ? "step_complete" : "idle");
    setInputKey((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setFileError("Choose one file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("token", token);
    formData.append("checklistItemId", item.id);

    if (step.part?.id) {
      formData.append("documentPartId", step.part.id);
    }

    if (qualityWarning) {
      formData.append("clientQualityWarning", qualityWarning);
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
        console.error("[capture-step] upload failed", {
          status: response.status,
          message: errorMessage
        });
        setState("preview");
        setUploadError(errorMessage);
        setMessage(null);
        return;
      }

      const uploadedDocument: UploadedDocument = {
        id: result.documentId,
        checklist_item_id: item.id,
        document_part_id: step.part?.id ?? null,
        original_filename: selectedFile.name,
        status: result.documentStatus || "uploaded",
        scan_status: result.scanStatus || "not_scanned",
        created_at: new Date().toISOString()
      };
      const needsRetake = shouldAskStudentToRetake(
        uploadedDocument.status,
        uploadedDocument.scan_status
      );

      setStatus(uploadedDocument.status || uploadedDocument.scan_status || null);
      setLastUploaded(uploadedDocument);
      setMessage(
        needsRetake
          ? result.scanMessage || result.message || "Please retake and upload again."
          : "Uploaded successfully. Your consultant will review it."
      );
      setState(needsRetake ? "needs_retake" : "step_complete");
      setSelectedFile(null);
      setInputKey((value) => value + 1);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      onUploaded(uploadedDocument, !needsRetake);
    } catch (error) {
      window.clearTimeout(scanTimer);
      console.error("[capture-step] upload request failed", error);
      setState("preview");
      setUploadError(
        error instanceof Error
          ? error.message
          : "Upload failed. Check your connection and try again."
      );
      setMessage(null);
    }
  }

  return (
    <form className="capture-step" onSubmit={handleSubmit}>
      <div className="capture-step-header">
        <div>
          <span className="muted">
            {typeof stepIndex === "number" && totalSteps
              ? `Step ${stepIndex + 1} of ${totalSteps}`
              : studentStepRequirementLabel(item, step)}
          </span>
          <h2>
            {typeof stepIndex === "number" && totalSteps
              ? `Capture ${step.label.toLowerCase()}`
              : step.label}
          </h2>
          {typeof stepIndex === "number" && totalSteps ? (
            <p className="muted">
              Place {item.document_name} {step.label.toLowerCase()} inside the frame.
            </p>
          ) : null}
        </div>
        {latest ? <span className="chip success">Already uploaded</span> : null}
      </div>
      {requestHint ? <p className="muted">{requestHint}</p> : null}
      {latest ? (
        <p className="muted">Latest upload: {latest.original_filename}</p>
      ) : null}
      {!selectedFile ? (
        <div className="button-row">
          {cameraEnabled ? (
            <label className="button">
              Take photo
              <input
                key={`camera-${inputKey}`}
                className="visually-hidden"
                type="file"
                accept={nativeCaptureAcceptValue()}
                capture="environment"
                onChange={handleFileChange}
              />
            </label>
          ) : null}
          <label className={cameraEnabled ? "button secondary" : "button"}>
            Upload from gallery / Choose file
            <input
              key={`file-${inputKey}`}
              className="visually-hidden"
              type="file"
              accept={fileInputAccept}
              onChange={handleFileChange}
            />
          </label>
        </div>
      ) : null}
      {selectedFile ? (
        <FilePreview file={selectedFile} previewUrl={previewUrl} />
      ) : null}
      <ScanQualityCheck
        result={qualityResult}
        isChecking={state === "checking_quality"}
      />
      {qualityWarning && !qualityResult ? (
        <div className="scan-quality-card warning">
          <strong>Manual review may be needed</strong>
          <p>{qualityWarning}</p>
        </div>
      ) : null}
      {selectedFile ? (
        <div className="button-row">
          {cameraEnabled ? (
            <label className="button secondary">
              Retake
              <input
                key={`retake-${inputKey}`}
                className="visually-hidden"
                type="file"
                accept={nativeCaptureAcceptValue()}
                capture="environment"
                onChange={handleFileChange}
              />
            </label>
          ) : null}
          <label className="button secondary">
            Choose another
            <input
              key={`choose-another-${inputKey}`}
              className="visually-hidden"
              type="file"
              accept={fileInputAccept}
              onChange={handleFileChange}
            />
          </label>
          <button
            className="button ghost"
            type="button"
            onClick={clearSelectedFile}
          >
            Clear
          </button>
        </div>
      ) : null}
      {fileError ? <span className="inline-error">{fileError}</span> : null}
      {uploadError ? <span className="inline-error">{uploadError}</span> : null}
      <ScanFeedback state={state} message={message} status={status} />
      {selectedFile ? (
        <div className="button-row">
          <button
            className="button"
            type="submit"
            disabled={
              !selectedFile ||
              Boolean(fileError) ||
              state === "checking_quality" ||
              state === "uploading" ||
              state === "scanning"
            }
          >
            {state === "checking_quality"
              ? "Checking..."
              : state === "uploading" || state === "scanning"
              ? "Working..."
              : qualityWarning
                ? "Continue anyway"
                : latest
                  ? "Use this file / Replace"
                  : "Use this file / Upload"}
          </button>
        </div>
      ) : null}
      {state === "needs_retake" ? (
        <div className="button-row">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setState("preview");
              setMessage(
                shouldRetake(status)
                  ? "Retake this side and upload again."
                  : "You can retake this file or continue for counselor review."
              );
            }}
          >
            Retake
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              const uploaded = lastUploaded || latest;

              if (!uploaded) {
                return;
              }

              onUploaded(uploaded, true);
            }}
          >
            Continue anyway
          </button>
        </div>
      ) : null}
    </form>
  );
}
