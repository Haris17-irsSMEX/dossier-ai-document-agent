"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ScanDocumentButton({
  documentId,
  scanStatus
}: {
  documentId: string;
  scanStatus?: string | null;
}) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(scanStatus === "scanning");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    setIsScanning(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/scan`, {
        method: "POST"
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || result.ok === false) {
        setError(result.message || "Document scan failed.");
      } else {
        setMessage(result.message || "Document scanned.");
      }

      router.refresh();
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Document scan failed."
      );
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="scan-action">
      <button
        className="button secondary"
        type="button"
        onClick={handleScan}
        disabled={isScanning}
      >
        {isScanning ? "Scanning..." : "Scan Document"}
      </button>
      {message ? <span className="muted">{message}</span> : null}
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}
