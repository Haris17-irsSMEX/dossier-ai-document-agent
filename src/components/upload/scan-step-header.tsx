import type { ChecklistItem, UploadStep } from "./types";

export function ScanStepHeader({
  item,
  step,
  stepIndex,
  totalSteps
}: {
  item: ChecklistItem;
  step: UploadStep;
  stepIndex: number;
  totalSteps: number;
}) {
  return (
    <div className="scan-step-header">
      <span className="chip info">
        {item.document_name}: Step {stepIndex + 1} of {totalSteps}
      </span>
      <h2>{step.label}</h2>
      <p className="muted">
        Place {item.document_name} {step.label.toLowerCase()} inside the frame.
      </p>
    </div>
  );
}
