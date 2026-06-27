import "server-only";

import { generateFollowUpMessage } from "@/lib/ai/provider";

type FollowUpChecklistItem = {
  document_name: string;
  status: string;
  instructions?: string | null;
  accepted_formats?: string[] | null;
};

type FollowUpVerification = {
  label?: string | null;
  status: string;
  provider?: { name?: string | null } | null;
};

export type FollowUpMessageInput = {
  studentName: string;
  studentPhone?: string | null;
  targetCountry?: string | null;
  uploadLink?: string | null;
  messageType?: string;
  checklistItems: FollowUpChecklistItem[];
  verificationRequests: FollowUpVerification[];
};

const problemStatuses = new Set([
  "missing",
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

export function buildDeterministicFollowUpMessage(input: FollowUpMessageInput) {
  const problemItems = input.checklistItems.filter((item) =>
    problemStatuses.has(item.status)
  );
  const requiredVerification = input.verificationRequests.filter((request) =>
    ["required", "pending", "failed", "suspicious", "manual_review", "api_not_connected"].includes(
      request.status
    )
  );

  const documentText = problemItems
    .map((item) => {
      const formats = item.accepted_formats?.length
        ? ` (${item.accepted_formats.join(", ").toUpperCase()})`
        : "";
      const note = item.instructions ? ` - ${item.instructions}` : "";
      return `${item.document_name}${formats}${note}`;
    })
    .join("; ");
  const verificationText = requiredVerification
    .map((request) => `${request.provider?.name || "Manual"} ${request.status}`)
    .join(", ");
  const intro = `Hi ${input.studentName}, this is a quick application file reminder.`;
  const uploadLine = input.uploadLink ? `Upload here: ${input.uploadLink}` : "";
  const lines =
    input.messageType === "upload_link"
      ? [
          `Hi ${input.studentName}, please use this secure link to upload your application documents.`,
          uploadLine,
          "Reply here if you need help."
        ]
      : input.messageType === "file_complete"
        ? [
            `Hi ${input.studentName}, thank you. Your uploaded documents are currently complete from our side.`,
            "We will contact you if anything else is needed."
          ]
        : input.messageType === "verification_required"
          ? [
              intro,
              verificationText ? `Verification pending: ${verificationText}.` : "",
              uploadLine,
              "Reply here if you need help."
            ]
          : [
              intro,
              documentText
                ? `Please review these documents: ${documentText}.`
                : "Your document checklist looks good right now.",
              verificationText ? `Verification pending: ${verificationText}.` : "",
              uploadLine,
              "Please upload corrected files or reply here if you need help."
            ];

  return lines.filter(Boolean).join("\n");
}

export async function generateStudentFollowUpMessage(
  input: FollowUpMessageInput
) {
  const problemItems = input.checklistItems.filter((item) =>
    problemStatuses.has(item.status)
  );

  try {
    const ai = await generateFollowUpMessage({
      studentName: input.studentName,
      destinationCountry: "Other",
      missingDocuments: problemItems
        .filter((item) => item.status === "missing")
        .map((item) => `${item.document_name}: ${item.instructions || ""}`),
      wrongDocuments: problemItems
        .filter((item) => ["wrong_format", "wrong_document"].includes(item.status))
        .map((item) => `${item.document_name}: accepted ${item.accepted_formats?.join(", ")}`),
      blurryDocuments: problemItems
        .filter((item) => item.status === "blurry")
        .map((item) => item.document_name),
      expiredDocuments: problemItems
        .filter((item) => item.status === "expired")
        .map((item) => item.document_name),
      verificationSteps: input.verificationRequests.map((request) => ({
        authority: "Other",
        label: request.label || request.provider?.name || "Verification",
        status: request.status === "verified" ? "verified" : "needs_action"
      })),
      tone: "friendly"
    });

    const uploadLine = input.uploadLink ? `\nUpload here: ${input.uploadLink}` : "";
    return {
      body: `${ai.message.trim()}${uploadLine}`,
      source: "deepseek" as const
    };
  } catch {
    return {
      body: buildDeterministicFollowUpMessage(input),
      source: "fallback" as const
    };
  }
}
