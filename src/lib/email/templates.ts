export const emailMessageTypes = [
  "student_upload_link",
  "missing_document_reminder",
  "reupload_required",
  "file_complete",
  "consultant_invite_foundation"
] as const;

export type EmailMessageType = (typeof emailMessageTypes)[number];

export type StudentUploadLinkEmailInput = {
  studentName: string;
  agencyName?: string;
  uploadUrl: string;
  expiresAt?: string;
  consultantLine?: string;
};

export type DocumentReminderEmailInput = {
  studentName: string;
  agencyName?: string;
  missingDocuments?: string[];
  problemDocuments?: string[];
  uploadUrl?: string;
  consultantLine?: string;
};

export type FollowUpEmailInput = DocumentReminderEmailInput & {
  messageType: EmailMessageType;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linesToHtml(lines: string[]) {
  return lines
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

export function buildStudentUploadLinkEmail(
  input: StudentUploadLinkEmailInput
) {
  const agencyName = input.agencyName || "Your consultant";
  const expiry = input.expiresAt
    ? `This secure link expires on ${input.expiresAt}.`
    : "This secure link may expire soon.";
  const lines = [
    `Hi ${input.studentName},`,
    `${agencyName} has requested documents for your application.`,
    `Upload your files here: ${input.uploadUrl}`,
    expiry,
    "Please upload only the requested file formats and contact your consultant if anything is unclear.",
    input.consultantLine || ""
  ];

  return {
    subject: `${agencyName} secure document upload link`,
    text: lines.filter(Boolean).join("\n\n"),
    html: linesToHtml(lines)
  };
}

export function buildDocumentReminderEmail(input: DocumentReminderEmailInput) {
  const missing = input.missingDocuments?.length
    ? input.missingDocuments.join(", ")
    : "None";
  const problems = input.problemDocuments?.length
    ? input.problemDocuments.join(", ")
    : "None";
  const lines = [
    `Hi ${input.studentName},`,
    `${input.agencyName || "Your consultant"} is following up on your application documents.`,
    `Missing documents: ${missing}`,
    `Documents needing attention: ${problems}`,
    input.uploadUrl ? `Upload corrected files here: ${input.uploadUrl}` : "",
    "Please send the requested files as soon as possible.",
    input.consultantLine || ""
  ];

  return {
    subject: "Application document reminder",
    text: lines.filter(Boolean).join("\n\n"),
    html: linesToHtml(lines)
  };
}

export function buildFollowUpEmail(input: FollowUpEmailInput) {
  if (input.messageType === "student_upload_link") {
    if (!input.uploadUrl) {
      throw new Error("Generate an upload link before sending this email.");
    }

    return buildStudentUploadLinkEmail({
      studentName: input.studentName,
      agencyName: input.agencyName,
      uploadUrl: input.uploadUrl,
      consultantLine: input.consultantLine
    });
  }

  if (input.messageType === "file_complete") {
    const lines = [
      `Hi ${input.studentName},`,
      `${input.agencyName || "Your consultant"} confirms that your requested file is currently complete.`,
      "We will contact you if anything else is needed.",
      input.consultantLine || ""
    ];
    return {
      subject: "Your application file is complete",
      text: lines.filter(Boolean).join("\n\n"),
      html: linesToHtml(lines)
    };
  }

  if (input.messageType === "consultant_invite_foundation") {
    const lines = [
      "You have been invited to an ApplicationOps AI agency workspace.",
      input.consultantLine || "Contact the agency owner for access details."
    ];
    return {
      subject: "Agency workspace invitation",
      text: lines.join("\n\n"),
      html: linesToHtml(lines)
    };
  }

  const reminder = buildDocumentReminderEmail(input);
  return {
    ...reminder,
    subject:
      input.messageType === "reupload_required"
        ? "Please reupload application documents"
        : reminder.subject
  };
}
