"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { ChecklistItem, UploadStep } from "./types";
import { acceptValue } from "./upload-utils";

const CAMERA_TIMEOUT_MS = 5000;

type CameraState = "opening" | "ready" | "fallback";

function getLiveCameraAvailability() {
  if (typeof window === "undefined") {
    return {
      canUseLiveCamera: false,
      secureContext: false,
      hasMediaDevices: false,
      hasGetUserMedia: false
    };
  }

  const secureContext = window.isSecureContext === true;
  const hasMediaDevices = Boolean(navigator.mediaDevices);
  const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);

  return {
    canUseLiveCamera: secureContext && hasMediaDevices && hasGetUserMedia,
    secureContext,
    hasMediaDevices,
    hasGetUserMedia
  };
}

function fallbackMessageFor(error?: unknown) {
  if (error && typeof error === "object" && "name" in error) {
    const name = String(error.name);

    if (
      ["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"].includes(
        name
      )
    ) {
      return "Camera blocked on this connection. Use Take Photo below.";
    }
  }

  return "Camera preview isn’t available on this connection. Use Take Photo or Choose File.";
}

function fileNameFor(item: ChecklistItem, step: UploadStep) {
  return `${item.document_name}-${step.label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CameraCapture({
  item,
  step,
  onCapture
}: {
  item: ChecklistItem;
  step: UploadStep;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("opening");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const availability = getLiveCameraAvailability();

  useEffect(() => {
    let cancelled = false;
    let activeStream: MediaStream | null = null;
    let timeoutId: number | null = null;

    function closeStream() {
      activeStream?.getTracks().forEach((track) => track.stop());
      activeStream = null;
    }

    function switchToFallback(message: string) {
      if (cancelled) {
        return;
      }

      closeStream();
      setCameraState("fallback");
      setCameraError(message);
    }

    async function openCamera() {
      if (!availability.canUseLiveCamera) {
        switchToFallback(
          "Camera preview isn’t available on this connection. Use Take Photo or Choose File."
        );
        return;
      }

      try {
        timeoutId = window.setTimeout(() => {
          switchToFallback("Camera blocked on this connection. Use Take Photo below.");
        }, CAMERA_TIMEOUT_MS);

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        activeStream = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }

        setCameraState("ready");
        setCameraError(null);
      } catch (error) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }

        console.error("[camera-capture] live camera unavailable", error);
        switchToFallback(fallbackMessageFor(error));
      }
    }

    void openCamera();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      closeStream();
    };
  }, [availability.canUseLiveCamera]);

  function handleCapture() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("Camera is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError("Could not capture photo.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Could not capture photo.");
          return;
        }

        onCapture(
          new File([blob], `${fileNameFor(item, step)}-${Date.now()}.jpg`, {
            type: "image/jpeg"
          })
        );
      },
      "image/jpeg",
      0.92
    );
  }

  function handleFallbackFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];

    if (file) {
      onCapture(file);
    }

    event.currentTarget.value = "";
  }

  const showLiveVideo = cameraState === "ready";

  return (
    <div className="camera-capture">
      {showLiveVideo ? (
        <div className="camera-stage">
            <video
              ref={videoRef}
              aria-label={`${item.document_name} ${step.label} camera preview`}
              autoPlay
              muted
              playsInline
            />
            <div className="document-frame-overlay">
              <div className="document-frame" />
              <span>
                Place {item.document_name} {step.label.toLowerCase()} inside the
                frame
              </span>
            </div>
        </div>
      ) : (
        <div className="camera-fallback-card">
          <span className="camera-fallback-icon">+</span>
          <div>
            <strong>
              {cameraState === "opening"
                ? "Opening camera..."
                : "Use your phone camera or choose a file"}
            </strong>
            <p>
              {cameraState === "opening"
                ? "We’ll show the document frame when the camera is ready."
                : cameraError ||
                  "Camera preview isn’t available on this connection. Use Take Photo or Choose File."}
            </p>
          </div>
        </div>
      )}
      <div className="scanner-actions">
        {cameraState === "ready" ? (
          <button
            className="button capture-button"
            type="button"
            onClick={handleCapture}
          >
            Capture
          </button>
        ) : null}
        <label className={`button ${cameraState === "ready" ? "secondary" : ""}`}>
          Take photo
          <input
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFallbackFile}
          />
        </label>
        <label className="button secondary">
          Choose file
          <input
            className="visually-hidden"
            type="file"
            accept={acceptValue(item.accepted_formats)}
            onChange={handleFallbackFile}
          />
        </label>
      </div>
      <p className="muted">
        Your photo is uploaded securely for your consultant. Live preview
        requires a secure HTTPS connection.
      </p>
    </div>
  );
}
