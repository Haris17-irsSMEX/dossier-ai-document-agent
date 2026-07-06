import "server-only";

import { generateFollowUpMessage } from "@/lib/ai/provider";
import {
  isActiveChecklistRequest,
  needsChecklistReview
} from "@/lib/checklists/request-logic";
import { formatDate } from "@/lib/date";
import type { ApplicationCountry } from "@/lib/types";

type FollowUpChecklistItem = {
  document_name: string;
  status: string;
  instructions?: string | null;
  accepted_formats?: string[] | null;
  requirement_level?: string | null;
  is_required?: boolean | null;
  is_requested?: boolean | null;
  counts_toward_completion?: boolean | null;
  is_archived?: boolean | null;
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
  consultantName?: string | null;
  agencyName?: string | null;
  deadline?: string | null;
  signature?: string | null;
  checklistItems: FollowUpChecklistItem[];
  verificationRequests: FollowUpVerification[];
};

function activeChecklistItems(items: FollowUpChecklistItem[]) {
  return items.filter(isActiveChecklistRequest);
}

function missingItems(items: FollowUpChecklistItem[]) {
  return activeChecklistItems(items).filter((item) => item.status === "missing");
}

function problemItems(items: FollowUpChecklistItem[]) {
  return activeChecklistItems(items).filter(
    (item) => item.status !== "missing" && needsChecklistReview(item)
  );
}

function formatDocumentLines(items: FollowUpChecklistItem[]) {
  return items.map((item, index) => `${index + 1}. ${item.document_name}`);
}

function formatSignature(signature?: string | null) {
  return signature?.trim() || "";
}

function normalizeApplicationCountry(value?: string | null) {
  const countries = new Set<ApplicationCountry>([
    "Australia",
    "Canada",
    "Germany",
    "United Kingdom",
    "United States",
    "Other"
  ]);

  return value && countries.has(value as ApplicationCountry)
    ? (value as ApplicationCountry)
    : undefined;
}

export function buildDeterministicFollowUpMessage(input: FollowUpMessageInput) {
  const missing = missingItems(input.checklistItems);
  const problems = problemItems(input.checklistItems);
  const requiredVerification = input.verificationRequests.filter((request) =>
    ["required", "pending", "failed", "suspicious", "manual_review", "api_not_connected"].includes(
      request.status
    )
  );
  const verificationText = requiredVerification
    .map((request) => `${request.provider?.name || "Manual"} ${request.status}`)
    .join(", ");
  const consultantLine =
    input.consultantName && input.agencyName
      ? `Hi ${input.studentName}, this is ${input.consultantName} from ${input.agencyName}.`
      : input.consultantName
        ? `Hi ${input.studentName}, this is ${input.consultantName}.`
        : `Hi ${input.studentName}, this is your consultant.`;
  const deadlineLine = input.deadline
    ? `Deadline: ${formatDate(input.deadline) || input.deadline}.`
    : "";
  const uploadLine = input.uploadLink
    ? `Upload your documents here:\n${input.uploadLink}`
    : "";
  const signature = formatSignature(input.signature);
  const lines =
    input.messageType === "upload_link"
      ? [
            consultantLine,
            missing.length
              ? "Your application file is missing these documents:"
              : "Please use this secure link to upload your requested documents.",
            ...formatDocumentLines(missing),
            uploadLine,
            deadlineLine,
          "If you have any questions, reply to this WhatsApp.",
          signature
        ]
      : input.messageType === "file_complete"
        ? [
            consultantLine,
            `Your uploaded documents currently look complete from our side.`,
            deadlineLine,
            "We will contact you if anything else is needed.",
            signature
          ]
        : input.messageType === "verification_required"
          ? [
              consultantLine,
              verificationText
                ? `We still need attention on these verification items: ${verificationText}.`
                : "We still need a verification update for your file.",
              uploadLine,
              deadlineLine,
              "If you have any questions, reply to this WhatsApp.",
              signature
            ]
          : input.messageType === "reupload_required"
            ? [
                consultantLine,
                problems.length
                  ? "Please reupload or correct these documents:"
                  : "A few uploaded documents still need attention.",
                ...formatDocumentLines(problems),
                uploadLine,
                deadlineLine,
                "If you have any questions, reply to this WhatsApp.",
                signature
              ]
            : [
                consultantLine,
                missing.length
                  ? "Your application file is missing these documents:"
                  : "Your application file still needs a quick update.",
                ...formatDocumentLines(missing),
                problems.length
                  ? "Please also reupload or correct these documents:"
                  : "",
                ...formatDocumentLines(problems),
                verificationText
                  ? `Verification still pending: ${verificationText}.`
                  : "",
                uploadLine,
                deadlineLine,
                "If you have any questions, reply to this WhatsApp.",
                signature
              ];

  return lines.filter(Boolean).join("\n\n");
}

export async function generateStudentFollowUpMessage(
  input: FollowUpMessageInput
) {
  const missing = missingItems(input.checklistItems);
  const problems = problemItems(input.checklistItems);

  try {
    const ai = await generateFollowUpMessage({
      studentName: input.studentName,
      consultantName: input.consultantName || undefined,
      agencyName: input.agencyName || undefined,
      deadline: input.deadline || undefined,
      destinationCountry:
        normalizeApplicationCountry(input.targetCountry) || "Other",
      uploadUrl: input.uploadLink || undefined,
      missingDocuments: missing.map((item) => item.document_name),
      wrongDocuments: problems
        .filter((item) => ["wrong_format", "wrong_document"].includes(item.status))
        .map((item) => item.document_name),
      blurryDocuments: problems
        .filter((item) => item.status === "blurry")
        .map((item) => item.document_name),
      expiredDocuments: problems
        .filter((item) => item.status === "expired")
        .map((item) => item.document_name),
      verificationSteps: input.verificationRequests.map((request) => ({
        authority: "Other",
        label: request.label || request.provider?.name || "Verification",
        status: request.status === "verified" ? "verified" : "needs_action"
      })),
      tone: "friendly"
    });

    const lines = [
      ai.message.trim(),
      input.uploadLink
        ? `Upload your documents here:\n${input.uploadLink}`
        : "",
      input.deadline
        ? `Deadline: ${formatDate(input.deadline) || input.deadline}.`
        : "",
      formatSignature(input.signature)
    ];

    return {
      body: lines.filter(Boolean).join("\n\n"),
      source: "deepseek" as const
    };
  } catch {
    return {
      body: buildDeterministicFollowUpMessage(input),
      source: "fallback" as const
    };
  }
}
