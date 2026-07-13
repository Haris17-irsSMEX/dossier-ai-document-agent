"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

import { FilePreview } from "./file-preview";
import { ScanFeedback } from "./scan-feedback";
import type {
  ChecklistItem,
  UploadedDocument,
  UploadStep,
  WizardState
} from "./types";
import {
  acceptValue,
  feedbackForDocument,
  isAcceptedClientFile,
  MAX_UPLOAD_BYTES,
  newestDocument,
  requiresStudentDecision,
  supportsCamera,
  studentDocumentRequestHint,
  studentStepRequirementLabel,
  uploadDocumentRequest
} from "./upload-utils";

function shouldRetake(status?: string | null) {
  return status === "blurry" || status === "wrong_document";
}

export function CaptureStep({
  token,
  item,
  step,
  documents,
  onUploaded
}: {
  token: string;
  item: ChecklistItem;
  step: UploadStep;
  documents: UploadedDocument[];
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
  const [message, setMessage] = useState<string | null>(
    feedbackForDocument(latest)
  );
  const [status, setStatus] = useState<string | null>(
    latest?.status || latest?.scan_status || null
  );
  const [inputKey, setInputKey] = useState(0);
  const cameraEnabled = supportsCamera(item.accepted_formats);
  const requestHint = studentDocumentRequestHint(item);

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
    setMessage(null);
    setStatus(null);
    setState("selecting_file");

    if (!file) {
      setState(latest ? "step_complete" : "idle");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError("File is too large. Upload a file up to 10 MB.");
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

    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    }
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
      const needsDecision = requiresStudentDecision(
        uploadedDocument.status,
        uploadedDocument.scan_status
      );

      setStatus(uploadedDocument.status || uploadedDocument.scan_status || null);
      setMessage(result.scanMessage || result.message || "Uploaded successfully.");
      setState(needsDecision ? "needs_retake" : "step_complete");
      setSelectedFile(null);
      setInputKey((value) => value + 1);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      onUploaded(uploadedDocument, !needsDecision);
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
          <span className="muted">{studentStepRequirementLabel(item, step)}</span>
          <h2>{step.label}</h2>
        </div>
        {latest ? <span className="chip success">Already uploaded</span> : null}
      </div>
      {requestHint ? <p className="muted">{requestHint}</p> : null}
      {latest ? (
        <p className="muted">Latest upload: {latest.original_filename}</p>
      ) : null}
      <div className="button-row">
        {cameraEnabled ? (
          <label className="button">
            Take photo or upload file
            <input
              key={`camera-or-file-${inputKey}`}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
            />
          </label>
        ) : (
          <label className="button">
            Upload file
            <input
              key={`file-${inputKey}`}
              className="visually-hidden"
              type="file"
              accept={acceptValue(item.accepted_formats)}
              onChange={handleFileChange}
            />
          </label>
        )}
        {cameraEnabled ? (
          <label className="button secondary">
            Choose file
            <input
              key={`file-${inputKey}`}
              className="visually-hidden"
              type="file"
              accept={acceptValue(item.accepted_formats)}
              onChange={handleFileChange}
            />
          </label>
        ) : null}
      </div>
      {selectedFile ? (
        <FilePreview file={selectedFile} previewUrl={previewUrl} />
      ) : null}
      {fileError ? <span className="inline-error">{fileError}</span> : null}
      {uploadError ? <span className="inline-error">{uploadError}</span> : null}
      <ScanFeedback state={state} message={message} status={status} />
      <div className="button-row">
        <button
          className="button"
          type="submit"
          disabled={!selectedFile || Boolean(fileError) || state === "uploading" || state === "scanning"}
        >
          {state === "uploading" || state === "scanning"
            ? "Working..."
            : latest
              ? "Replace and upload"
              : "Confirm upload"}
        </button>
        {state === "needs_retake" ? (
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
        ) : null}
        {state === "needs_retake" ? (
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              if (!latest) {
                return;
              }

              onUploaded(latest, true);
            }}
          >
            Continue anyway
          </button>
        ) : null}
      </div>
    </form>
  );
}
