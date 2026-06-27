import type { WizardState } from "./types";
import { statusTone } from "./upload-utils";

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
      <span>{label.replaceAll("_", " ")}</span>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
