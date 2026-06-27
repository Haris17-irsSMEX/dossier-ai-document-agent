const toneByStatus: Record<string, string> = {
  missing: "danger",
  uploaded: "info",
  wrong_format: "warning",
  wrong_document: "warning",
  blurry: "warning",
  expired: "danger",
  name_mismatch: "warning",
  needs_review: "info",
  suspicious: "danger",
  accepted: "success",
  rejected: "danger",
  official_verification_required: "warning",
  officially_verified: "success"
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const tone = toneByStatus[status] || "info";
  return <span className={`chip ${tone}`}>{status.replaceAll("_", " ")}</span>;
}
