export const caseStages = [
  "profile_collection",
  "university_application",
  "offer_received",
  "visa_processing",
  "verification_attestation",
  "pre_departure",
  "completed"
] as const;

export type CaseStage = (typeof caseStages)[number];

export type ChecklistRequestState = {
  status?: string | null;
  requirement_level?: string | null;
  is_required?: boolean | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  is_archived?: boolean | null;
  applies_from_stage?: string | null;
};

export const readyChecklistStatuses = new Set(["accepted", "officially_verified"]);
export const uploadedChecklistStatuses = new Set([
  "uploaded",
  "accepted",
  "officially_verified",
  "wrong_format",
  "wrong_document",
  "blurry",
  "expired",
  "name_mismatch",
  "needs_review",
  "suspicious",
  "rejected",
  "official_verification_required"
]);
export const reviewChecklistStatuses = new Set([
  "wrong_format",
  "wrong_document",
  "blurry",
  "expired",
  "name_mismatch",
  "needs_review",
  "suspicious",
  "rejected",
  "official_verification_required"
]);

export function requirementLevel(item: ChecklistRequestState) {
  return item.requirement_level || (item.is_required ? "required" : "optional");
}

export function isRequested(item: ChecklistRequestState) {
  if (item.is_requested !== null && item.is_requested !== undefined) {
    return item.is_requested;
  }

  return requirementLevel(item) === "required";
}

export function countsTowardCompletion(item: ChecklistRequestState) {
  if (
    item.counts_toward_completion !== null &&
    item.counts_toward_completion !== undefined
  ) {
    return item.counts_toward_completion;
  }

  return isRequested(item);
}

export function isActiveChecklistRequest(item: ChecklistRequestState) {
  return (
    item.is_archived !== true &&
    isRequested(item) &&
    countsTowardCompletion(item)
  );
}

export function isMissingActiveRequest(item: ChecklistRequestState) {
  return isActiveChecklistRequest(item) && (item.status || "missing") === "missing";
}

export function hasUploadedChecklistFile(item: ChecklistRequestState) {
  return uploadedChecklistStatuses.has(item.status || "");
}

export function needsChecklistReview(item: ChecklistRequestState) {
  return reviewChecklistStatuses.has(item.status || "");
}

export function isChecklistReady(item: ChecklistRequestState) {
  return readyChecklistStatuses.has(item.status || "");
}

export function summarizeChecklist<T extends ChecklistRequestState>(items: T[]) {
  const active = items.filter(isActiveChecklistRequest);
  const unarchived = items.filter((item) => item.is_archived !== true);
  const suggested = unarchived.filter((item) => !isRequested(item));

  return {
    active,
    requestedFromStudent: active.length,
    missing: active.filter((item) => (item.status || "missing") === "missing").length,
    suggestedByDossier: suggested.length,
    requiredNow: active.filter((item) => requirementLevel(item) === "required").length,
    missingRequired: active.filter(
      (item) =>
        requirementLevel(item) === "required" &&
        (item.status || "missing") === "missing"
    ).length,
    requestedConditional: active.filter(
      (item) => requirementLevel(item) === "conditional"
    ).length,
    conditionalAvailable: items.filter(
      (item) =>
        item.is_archived !== true &&
        requirementLevel(item) === "conditional" &&
        !isRequested(item)
    ).length,
    optionalAvailable: items.filter(
      (item) =>
        item.is_archived !== true &&
        requirementLevel(item) === "optional" &&
        !isRequested(item)
    ).length,
    uploaded: active.filter(hasUploadedChecklistFile).length,
    needsReview: active.filter(needsChecklistReview).length,
    ready: active.filter(isChecklistReady).length,
    completionPercent: active.length
      ? Math.round((active.filter(isChecklistReady).length / active.length) * 100)
      : 0
  };
}

const stageRank = new Map(caseStages.map((stage, index) => [stage, index]));

export function isAvailableLater(
  item: ChecklistRequestState,
  currentStage?: string | null
) {
  if (isRequested(item) || !item.applies_from_stage) {
    return false;
  }

  const current = stageRank.get((currentStage || "profile_collection") as CaseStage) ?? 0;
  const applies = stageRank.get(item.applies_from_stage as CaseStage) ?? 0;
  return applies > current;
}
