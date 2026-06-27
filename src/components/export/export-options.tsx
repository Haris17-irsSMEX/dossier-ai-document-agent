"use client";

export type ExportOptionsValue = {
  includeAcceptedOnly: boolean;
  includeUploadedAndNeedsReview: boolean;
  excludeRejected: boolean;
  includeVerificationReport: boolean;
  includeScanIssueReport: boolean;
  includeProfileSummaryPdf: boolean;
};

export const defaultExportOptionsValue: ExportOptionsValue = {
  includeAcceptedOnly: false,
  includeUploadedAndNeedsReview: true,
  excludeRejected: true,
  includeVerificationReport: true,
  includeScanIssueReport: true,
  includeProfileSummaryPdf: true
};

export function ExportOptions({
  value,
  onChange,
  disabled
}: {
  value: ExportOptionsValue;
  onChange: (value: ExportOptionsValue) => void;
  disabled?: boolean;
}) {
  function setOption(key: keyof ExportOptionsValue, optionValue: boolean) {
    onChange({
      ...value,
      [key]: optionValue,
      ...(key === "includeAcceptedOnly" && optionValue
        ? { includeUploadedAndNeedsReview: false }
        : {})
    });
  }

  return (
    <fieldset className="export-options">
      <legend>Export options</legend>
      <label className="check-row">
        <input
          checked={value.includeAcceptedOnly}
          disabled={disabled}
          type="checkbox"
          onChange={(event) =>
            setOption("includeAcceptedOnly", event.currentTarget.checked)
          }
        />
        Include accepted documents only
      </label>
      <label className="check-row">
        <input
          checked={value.includeUploadedAndNeedsReview}
          disabled={disabled || value.includeAcceptedOnly}
          type="checkbox"
          onChange={(event) =>
            setOption("includeUploadedAndNeedsReview", event.currentTarget.checked)
          }
        />
        Include uploaded and needs-review documents
      </label>
      <label className="check-row">
        <input
          checked={value.excludeRejected}
          disabled={disabled}
          type="checkbox"
          onChange={(event) => setOption("excludeRejected", event.currentTarget.checked)}
        />
        Exclude rejected documents
      </label>
      <label className="check-row">
        <input
          checked={value.includeVerificationReport}
          disabled={disabled}
          type="checkbox"
          onChange={(event) =>
            setOption("includeVerificationReport", event.currentTarget.checked)
          }
        />
        Include verification report
      </label>
      <label className="check-row">
        <input
          checked={value.includeScanIssueReport}
          disabled={disabled}
          type="checkbox"
          onChange={(event) =>
            setOption("includeScanIssueReport", event.currentTarget.checked)
          }
        />
        Include AI scan issue report
      </label>
      <label className="check-row">
        <input
          checked={value.includeProfileSummaryPdf}
          disabled={disabled}
          type="checkbox"
          onChange={(event) =>
            setOption("includeProfileSummaryPdf", event.currentTarget.checked)
          }
        />
        Include student profile summary PDF
      </label>
    </fieldset>
  );
}
