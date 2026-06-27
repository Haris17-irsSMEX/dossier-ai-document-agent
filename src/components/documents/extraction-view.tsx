type Extraction = {
  raw_text?: string | null;
  confidence?: number | null;
  status?: string | null;
  error_message?: string | null;
  extracted_fields?: {
    ai_validation?: {
      detected_document_type?: string;
      confidence?: number;
      extracted_fields?: Record<string, string | null>;
    } | null;
    ocr_metadata?: Record<string, unknown>;
    ai_validation_error?: string | null;
  } | null;
};

function confidenceLabel(value?: number | null) {
  if (typeof value !== "number") {
    return "Not available";
  }

  return `${Math.round(value * 100)}%`;
}

function textPreview(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "No OCR text captured yet.";
  }

  return trimmed.length > 900 ? `${trimmed.slice(0, 900)}...` : trimmed;
}

export function ExtractionView({ extraction }: { extraction?: Extraction }) {
  if (!extraction) {
    return (
      <div className="empty-state compact-empty">
        <strong>No extraction yet</strong>
        <p>Run a scan to see OCR text, extracted fields, and evidence.</p>
      </div>
    );
  }

  const ai = extraction.extracted_fields?.ai_validation;
  const extractedFields = ai?.extracted_fields ?? {};
  const fieldEntries = Object.entries(extractedFields).filter(([, value]) =>
    Boolean(value)
  );

  return (
    <div className="extraction-view">
      {extraction.status === "failed" || extraction.error_message ? (
        <div className="alert error">
          {extraction.error_message || "Document scan failed."}
        </div>
      ) : null}
      <div className="scan-grid">
        <div>
          <span className="muted">Detected type</span>
          <strong>{ai?.detected_document_type || "Not detected yet"}</strong>
        </div>
        <div>
          <span className="muted">OCR confidence</span>
          <strong>{confidenceLabel(extraction.confidence)}</strong>
        </div>
        <div>
          <span className="muted">AI confidence</span>
          <strong>{confidenceLabel(ai?.confidence)}</strong>
        </div>
      </div>
      {fieldEntries.length ? (
        <div className="key-value-grid">
          {fieldEntries.map(([key, value]) => (
            <div key={key}>
              <span className="muted">{key.replaceAll("_", " ")}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <details>
        <summary>OCR text preview</summary>
        <pre className="ocr-preview">{textPreview(extraction.raw_text)}</pre>
      </details>
    </div>
  );
}
