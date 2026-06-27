"use client";

import { useState } from "react";

import { QRCodeSVG } from "qrcode.react";
import { formatDateTime } from "@/lib/date";

export function UploadLinkCard({
  localUploadUrl,
  mobileUploadUrl,
  uploadPath,
  expiresAt,
  followUpHref
}: {
  localUploadUrl: string;
  mobileUploadUrl: string;
  uploadPath: string;
  expiresAt?: string;
  followUpHref?: string;
}) {
  const [copiedTarget, setCopiedTarget] = useState<"local" | "mobile" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function handleCopy(target: "local" | "mobile") {
    try {
      const value = target === "mobile" ? mobileUploadUrl : localUploadUrl;
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      setCopyError(null);
      window.setTimeout(() => setCopiedTarget(null), 2000);
    } catch {
      setCopyError("Could not copy the upload link. Please copy it manually.");
    }
  }

  const expiryLabel = formatDateTime(expiresAt);

  return (
    <div className="panel upload-link-card">
      <div className="upload-link-main">
        <div className="section-stack">
          <div>
            <span className="chip success">Upload link ready</span>
            <h2>Mobile upload handoff</h2>
            <p className="muted">
              Scan this QR on your phone to upload documents with camera.
            </p>
            {expiryLabel ? (
              <p className="muted">Expires {expiryLabel}</p>
            ) : null}
          </div>
          <label>
            Open on this computer
            <input
              readOnly
              value={localUploadUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => handleCopy("local")}
            >
              {copiedTarget === "local" ? "Copied" : "Copy local link"}
            </button>
            <a
              className="button"
              href={localUploadUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on this computer
            </a>
          </div>
          <label>
            Scan on phone
            <input
              readOnly
              value={mobileUploadUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => handleCopy("mobile")}
            >
              {copiedTarget === "mobile" ? "Copied" : "Copy mobile link"}
            </button>
            {followUpHref ? (
              <a className="button secondary" href={followUpHref}>
                Send WhatsApp
              </a>
            ) : null}
          </div>
          {copyError ? <div className="alert error">{copyError}</div> : null}
        </div>
        <div className="qr-card" aria-label={`QR code for ${uploadPath}`}>
          <QRCodeSVG
            value={mobileUploadUrl}
            size={190}
            level="M"
            marginSize={3}
            title="Mobile upload QR code"
          />
          <span className="muted">Scan on phone</span>
        </div>
      </div>
    </div>
  );
}
