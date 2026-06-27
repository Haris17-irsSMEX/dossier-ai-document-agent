"use client";

import { useEffect, useState, useTransition } from "react";

import { generateExportPacketAction } from "@/lib/actions/export-packets";

import {
  ExportOptions,
  defaultExportOptionsValue,
  type ExportOptionsValue
} from "./export-options";

type ExportResult = {
  fileName: string;
  downloadUrl: string;
  exportPacketId: string;
  includedDocumentsCount: number;
  unavailableFilesCount: number;
};

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export function ExportPacketButton({ studentId }: { studentId: string }) {
  const [options, setOptions] = useState<ExportOptionsValue>(defaultExportOptionsValue);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    return () => {
      if (result?.downloadUrl) {
        URL.revokeObjectURL(result.downloadUrl);
      }
    };
  }, [result?.downloadUrl]);

  function generatePacket() {
    setError(null);

    if (result?.downloadUrl) {
      URL.revokeObjectURL(result.downloadUrl);
    }

    setResult(null);
    startTransition(async () => {
      const response = await generateExportPacketAction({ studentId, options });

      if (!response.ok) {
        setError(response.error);
        return;
      }

      const blob = base64ToBlob(response.base64, "application/zip");
      const downloadUrl = URL.createObjectURL(blob);
      setResult({
        fileName: response.fileName,
        downloadUrl,
        exportPacketId: response.exportPacketId,
        includedDocumentsCount: response.includedDocumentsCount,
        unavailableFilesCount: response.unavailableFiles.length
      });
    });
  }

  return (
    <section className="panel section-stack">
      <div className="section-title">
        <div>
          <h2>Generate packet</h2>
          <p>Select what should be included in the ZIP.</p>
        </div>
      </div>
      <ExportOptions value={options} disabled={isPending} onChange={setOptions} />
      {error ? <div className="alert error">{error}</div> : null}
      {result ? (
        <div className="alert success">
          <strong>Export packet ready</strong>
          <p>
            Included {result.includedDocumentsCount} document file
            {result.includedDocumentsCount === 1 ? "" : "s"}. Export ID:{" "}
            {result.exportPacketId}
          </p>
          {result.unavailableFilesCount ? (
            <p>
              {result.unavailableFilesCount} storage file
              {result.unavailableFilesCount === 1 ? " was" : "s were"} unavailable and
              listed in the report.
            </p>
          ) : null}
          <a className="button" download={result.fileName} href={result.downloadUrl}>
            Download ZIP
          </a>
        </div>
      ) : null}
      <div className="button-row">
        <button
          className="button"
          disabled={isPending}
          type="button"
          onClick={generatePacket}
        >
          {isPending ? "Generating..." : "Generate export packet"}
        </button>
      </div>
    </section>
  );
}
