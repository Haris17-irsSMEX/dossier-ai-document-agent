import type { WizardState } from "./types";
import { statusTone } from "./upload-utils";

function feedbackLabel(statusOrState: string) {
  switch (statusOrState) {
    case "scan_failed":
      return "Uploaded";
    case "needs_review":
      return "Needs review";
    default:
      return statusOrState.replaceAll("_", " ");
  }
}

export function ScanFeedback({
  state,
  message,
  status
}: {
  state: WizardState;
  message?: string | null;
  status?: string | null;
}) {
  if (!message && state === "idle") {
    return null;
  }

  const label =
    state === "uploading"
      ? "Uploading..."
      : state === "scanning"
        ? "Scanning..."
        : status || state;

  return (
    <div className={`scan-feedback ${statusTone(status || state)}`}>
      <span>{feedbackLabel(label)}</span>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
