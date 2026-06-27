import { format } from "date-fns";

type ReminderTemplateInput = {
  studentName: string;
  agencyName?: string;
  missingDocuments?: string[];
  wrongDocuments?: string[];
  blurryDocuments?: string[];
  expiredDocuments?: string[];
  deadline?: Date | string;
  portalUrl?: string;
};

type VerificationTemplateInput = {
  studentName: string;
  agencyName?: string;
  verificationLabel: string;
  status: string;
  nextAction?: string;
};

function joinItems(values?: string[]) {
  return values?.length ? values.join(", ") : "none";
}

function formatDeadline(deadline?: Date | string) {
  if (!deadline) {
    return undefined;
  }

  const date = typeof deadline === "string" ? new Date(deadline) : deadline;

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return format(date, "PPP");
}

export function buildDocumentReminderMessage(input: ReminderTemplateInput) {
  const deadline = formatDeadline(input.deadline);
  const lines = [
    `Hi ${input.studentName}, this is ${
      input.agencyName || "your consultant"
    }.`,
    "Please help us complete your application file.",
    `Missing: ${joinItems(input.missingDocuments)}`,
    `Wrong file: ${joinItems(input.wrongDocuments)}`,
    `Blurry scan: ${joinItems(input.blurryDocuments)}`,
    `Expired: ${joinItems(input.expiredDocuments)}`
  ];

  if (deadline) {
    lines.push(`Target date: ${deadline}`);
  }

  if (input.portalUrl) {
    lines.push(`Upload here: ${input.portalUrl}`);
  }

  lines.push("Reply here if anything is unclear.");

  return lines.join("\n");
}

export function buildVerificationUpdateMessage(
  input: VerificationTemplateInput
) {
  const lines = [
    `Hi ${input.studentName}, this is ${
      input.agencyName || "your consultant"
    }.`,
    `${input.verificationLabel} is currently marked as ${input.status}.`
  ];

  if (input.nextAction) {
    lines.push(`Next action: ${input.nextAction}`);
  }

  return lines.join("\n");
}

export const messagingTemplates = {
  buildDocumentReminderMessage,
  buildVerificationUpdateMessage
};
