"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import {
  createWhatsAppUploadLinkAction,
  generateFollowUpDraftAction,
  markWhatsAppHandoffSentAction,
  openManualWhatsAppHandoffAction,
  sendFollowUpWhatsAppAction
} from "@/lib/actions/whatsapp-messages";
import {
  generateFollowUpEmailDraftAction,
  sendFollowUpEmailAction
} from "@/lib/actions/email-messages";
import {
  buildWhatsAppHandoffUrl,
  validateWhatsAppNumber
} from "@/lib/communication/whatsapp-handoff";
import { isPrivateOrLocalUrl } from "@/lib/config/app-url";
import type { MessageType, WhatsAppProvider } from "@/lib/types";

import { SendWhatsAppButton } from "./send-whatsapp-button";

const messageTypes: Array<{ value: MessageType; label: string }> = [
  { value: "upload_link", label: "Upload link" },
  { value: "missing_documents", label: "Missing documents" },
  { value: "reupload_required", label: "Reupload required" },
  { value: "verification_required", label: "Verification required" },
  { value: "file_complete", label: "File complete" }
];

function requiresUploadLink(messageType: MessageType) {
  return messageType === "upload_link";
}

const UPLOAD_LINK_LABEL = "Upload your documents here:";
const EMAIL_UPLOAD_LINK_LABEL = "Upload link:";
const UPLOAD_URL_PATTERN = /https?:\/\/[^\s]+\/upload\/[A-Za-z0-9_-]+/gi;

function normalizeBody(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function cleanupSpacing(value: string) {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function buildUploadLinkBlock(uploadLink: string) {
  return `${UPLOAD_LINK_LABEL}\n${uploadLink}`;
}

function syncMessageWithUploadLink(message: string, uploadLink: string) {
  const normalizedMessage = normalizeBody(message).trim();
  const uploadBlock = buildUploadLinkBlock(uploadLink);

  if (!normalizedMessage) {
    return uploadBlock;
  }

  if (
    normalizedMessage.includes(uploadLink) &&
    normalizedMessage.includes(UPLOAD_LINK_LABEL)
  ) {
    return normalizedMessage;
  }

  const directBlockPattern =
    /(Upload your documents here:|Please upload here:)\s*\n+https?:\/\/[^\s]+\/upload\/[A-Za-z0-9_-]+/i;

  if (directBlockPattern.test(normalizedMessage)) {
    return cleanupSpacing(
      normalizedMessage.replace(directBlockPattern, uploadBlock)
    );
  }

  const replacedUrlMessage = normalizedMessage.replace(
    UPLOAD_URL_PATTERN,
    uploadLink
  );

  if (replacedUrlMessage !== normalizedMessage) {
    return cleanupSpacing(replacedUrlMessage);
  }

  const insertionTargets = [
    "\n\nDeadline:",
    "\n\nIf you have any questions",
    "\n\nKind regards,",
    "\n\nRegards,",
    "\n\nBest regards,",
    "\n\nThanks,"
  ];

  for (const marker of insertionTargets) {
    const index = normalizedMessage.indexOf(marker);

    if (index !== -1) {
      return cleanupSpacing(
        `${normalizedMessage.slice(0, index)}\n\n${uploadBlock}${normalizedMessage.slice(index)}`
      );
    }
  }

  return cleanupSpacing(`${normalizedMessage}\n\n${uploadBlock}`);
}

function syncEmailBodyWithUploadLink(message: string, uploadLink: string) {
  const normalizedMessage = normalizeBody(message).trim();
  const uploadBlock = `${EMAIL_UPLOAD_LINK_LABEL}\n${uploadLink}`;

  if (!normalizedMessage) {
    return uploadBlock;
  }

  if (
    normalizedMessage.includes(uploadLink) &&
    normalizedMessage.includes(EMAIL_UPLOAD_LINK_LABEL)
  ) {
    return normalizedMessage;
  }

  const directBlockPattern =
    /Upload link:\s*\n+https?:\/\/[^\s]+\/upload\/[A-Za-z0-9_-]+/i;

  if (directBlockPattern.test(normalizedMessage)) {
    return cleanupSpacing(
      normalizedMessage.replace(directBlockPattern, uploadBlock)
    );
  }

  const replacedUrlMessage = normalizedMessage.replace(
    UPLOAD_URL_PATTERN,
    uploadLink
  );

  if (replacedUrlMessage !== normalizedMessage) {
    return cleanupSpacing(replacedUrlMessage);
  }

  const insertionTargets = [
    "\n\nPlease complete this before",
    "\n\nRegards,",
    "\n\nKind regards,",
    "\n\nBest regards,"
  ];

  for (const marker of insertionTargets) {
    const index = normalizedMessage.indexOf(marker);

    if (index !== -1) {
      return cleanupSpacing(
        `${normalizedMessage.slice(0, index)}\n\n${uploadBlock}${normalizedMessage.slice(index)}`
      );
    }
  }

  return cleanupSpacing(`${normalizedMessage}\n\n${uploadBlock}`);
}

export function FollowUpMessageGenerator({
  studentId,
  initialBody,
  initialUploadLink,
  hasActiveUploadToken,
  studentEmail,
  studentPhone,
  gmailConnectedEmail,
  whatsappProvider,
  consultantWhatsAppNumber,
  consultantDisplayName,
  communicationSettingsError,
  latestManualHandoffId,
  initialEmailSubject,
  initialEmailBody
}: {
  studentId: string;
  initialBody: string;
  initialUploadLink?: string | null;
  hasActiveUploadToken?: boolean;
  studentEmail?: string | null;
  studentPhone?: string | null;
  gmailConnectedEmail?: string | null;
  whatsappProvider: WhatsAppProvider;
  consultantWhatsAppNumber?: string | null;
  consultantDisplayName?: string | null;
  communicationSettingsError?: string | null;
  latestManualHandoffId?: string | null;
  initialEmailSubject?: string;
  initialEmailBody?: string;
}) {
  const [messageType, setMessageType] = useState<MessageType>("upload_link");
  const [uploadLink, setUploadLink] = useState(initialUploadLink || "");
  const [body, setBody] = useState(() =>
    initialUploadLink
      ? syncMessageWithUploadLink(initialBody, initialUploadLink)
      : initialBody
  );
  const [status, setStatus] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailStatusTone, setEmailStatusTone] = useState<"info" | "success" | "error">("info");
  const [lastHandoffId, setLastHandoffId] = useState(latestManualHandoffId || "");
  const [emailSubject, setEmailSubject] = useState(initialEmailSubject || "");
  const [emailBody, setEmailBody] = useState(() =>
    initialUploadLink
      ? syncEmailBodyWithUploadLink(initialEmailBody || "", initialUploadLink)
      : initialEmailBody || ""
  );
  const [isPending, startTransition] = useTransition();
  const canSend = body.trim().length > 0;
  const canSendEmail = emailSubject.trim().length > 0 && emailBody.trim().length > 0;
  const isManualHandoff = whatsappProvider === "manual_handoff";
  const manualAvailable = isManualHandoff && !communicationSettingsError;
  const gmailConnected = Boolean(gmailConnectedEmail);
  const hasValidStudentEmail = Boolean(
    studentEmail?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(studentEmail.trim())
  );
  const needsUploadLink = requiresUploadLink(messageType);
  const phoneValidation = studentPhone?.trim()
    ? validateWhatsAppNumber(studentPhone)
    : {
        ok: false as const,
        error: "Add a valid student WhatsApp number first."
      };
  const whatsappUrl =
    manualAvailable &&
    canSend &&
    (!needsUploadLink || Boolean(uploadLink)) &&
    phoneValidation.ok
      ? buildWhatsAppHandoffUrl(phoneValidation.normalized, body)
      : null;
  const canOpenManual = Boolean(whatsappUrl);
  const canMarkSent = manualAvailable && Boolean(lastHandoffId);
  const phonePreview = phoneValidation.ok
    ? `+${phoneValidation.normalized}`
    : null;
  const uploadLinkIsLocal = uploadLink ? isPrivateOrLocalUrl(uploadLink) : false;
  const messageHasLatestUploadLink = uploadLink ? body.includes(uploadLink) : false;
  const emailHasLatestUploadLink = uploadLink ? emailBody.includes(uploadLink) : false;

  function generateUploadLink() {
    setStatus(null);
    startTransition(async () => {
      const result = await createWhatsAppUploadLinkAction({ studentId });

      if (!result.ok) {
        setStatus(`Upload link failed: ${result.error}`);
        return;
      }

      setUploadLink(result.uploadLink);
      setBody((current) => syncMessageWithUploadLink(current, result.uploadLink));
      setEmailBody((current) =>
        current.trim()
          ? syncEmailBodyWithUploadLink(current, result.uploadLink)
          : current
      );
      setStatus("Upload link updated in message.");
    });
  }

  function generateDraft() {
    setStatus(null);
    startTransition(async () => {
      const draft = await generateFollowUpDraftAction({
        studentId,
        messageType,
        uploadLink
      });
      setBody(draft.body);
      setStatus(`Draft generated by ${draft.source}.`);
    });
  }

  function generateEmailDraft() {
    setEmailStatus(null);
    startTransition(async () => {
      const draft = await generateFollowUpEmailDraftAction({
        studentId,
        messageType,
        uploadLink
      });

      if (!draft.ok) {
        setEmailStatusTone("error");
        setEmailStatus(`Email draft failed: ${draft.error}`);
        return;
      }

      setEmailSubject(draft.subject);
      setEmailBody(draft.body);
      setEmailStatusTone("success");
      setEmailStatus("Email draft generated.");
    });
  }

  function insertLatestUploadLink() {
    if (!uploadLink) {
      setStatus("Generate an upload link first.");
      return;
    }

    setBody((current) => syncMessageWithUploadLink(current, uploadLink));
    setStatus("Latest upload link inserted.");
  }

  function insertLatestEmailUploadLink() {
    if (!uploadLink) {
      setEmailStatusTone("info");
      setEmailStatus("Generate an upload link first.");
      return;
    }

    setEmailBody((current) => syncEmailBodyWithUploadLink(current, uploadLink));
    setEmailStatusTone("success");
    setEmailStatus("Latest upload link inserted into email.");
  }

  async function copyWhatsAppLink() {
    if (!whatsappUrl) {
      setStatus(
        phoneValidation.ok
          ? "Generate a message first."
          : phoneValidation.error
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(whatsappUrl);
      setStatus("WhatsApp link copied.");
    } catch {
      setStatus("Copy failed. Copy the WhatsApp link manually.");
    }
  }

  async function copyMessage() {
    if (!body.trim()) {
      setStatus("Generate a message first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(body);
      setStatus("Message copied.");
    } catch {
      setStatus("Copy failed. Select the message and copy it manually.");
    }
  }

  async function copyEmailDraft() {
    if (!canSendEmail) {
      setEmailStatusTone("info");
      setEmailStatus("Generate the email draft first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(`${emailSubject}\n\n${emailBody}`);
      setEmailStatusTone("success");
      setEmailStatus("Email draft copied.");
    } catch {
      setEmailStatusTone("error");
      setEmailStatus("Copy failed. Select the email draft and copy it manually.");
    }
  }

  function logManualWhatsAppOpen() {
    if (!canOpenManual || !whatsappUrl) {
      setStatus(
        !phoneValidation.ok
          ? phoneValidation.error
          : !canSend
            ? "Generate a message first."
            : "Generate an upload link first."
      );
      return;
    }

    setStatus(
      "Opening WhatsApp for the student chat. Review the message there and click Send from your own WhatsApp account."
    );

    startTransition(async () => {
      const result = await openManualWhatsAppHandoffAction({
        studentId,
        messageType,
        body
      });

      if (!result.ok) {
        setStatus(
          `WhatsApp opened, but handoff logging failed: ${result.error}`
        );
        return;
      }

      setLastHandoffId(result.handoffId);
    });
  }

  function markAsSent() {
    if (!canMarkSent) {
      setStatus("Open WhatsApp first, then mark the handoff as sent.");
      return;
    }

    setStatus(null);
    startTransition(async () => {
      const result = await markWhatsAppHandoffSentAction({
        studentId,
        handoffId: lastHandoffId
      });

      setStatus(
        result.ok
          ? "Marked as sent manually."
          : `Could not mark as sent: ${result.error}`
      );
    });
  }

  function sendMessage() {
    setStatus(null);
    startTransition(async () => {
      const result = await sendFollowUpWhatsAppAction({
        studentId,
        messageType,
        body
      });
      setStatus(
        result.ok
          ? `Sent via Twilio: ${result.status}`
          : `Failed: ${result.error || "Twilio send failed."}`
      );
    });
  }

  function sendEmailMessage() {
    setEmailStatus(null);
    startTransition(async () => {
      const result = await sendFollowUpEmailAction({
        studentId,
        messageType,
        subject: emailSubject,
        body: emailBody
      });
      if (result.ok) {
        setEmailStatusTone("success");
        setEmailStatus(
          result.fromEmail
            ? `Sent from ${result.fromEmail}.`
            : result.message || "Email sent."
        );
        return;
      }

      setEmailStatusTone("error");
      setEmailStatus(`Email failed: ${result.error || "Gmail send failed."}`);
    });
  }

  return (
    <section className="panel section-stack">
      <div className="section-title">
        <div>
          <h2>WhatsApp follow-up</h2>
          <p>
            {isManualHandoff
              ? "Generate a ready message, open the student chat, and send it manually from your own WhatsApp account."
              : "Generate a polite draft, edit it, then send through Twilio."}
          </p>
        </div>
      </div>

      {hasActiveUploadToken && !uploadLink ? (
        <div className="alert info">
          An active upload token exists, but the raw link is only shown when it is generated.
          Generate a new link to send it on WhatsApp.
        </div>
      ) : null}

      {communicationSettingsError ? (
        <div className="alert error">{communicationSettingsError}</div>
      ) : null}

      {uploadLink && uploadLinkIsLocal ? (
        <div className="alert info">
          This upload link is local. It works only on your Wi-Fi/network. For
          real students, use a deployed domain or ngrok/Cloudflare Tunnel.
        </div>
      ) : null}

      {isManualHandoff && !consultantWhatsAppNumber ? (
        <div className="alert info">
          Your WhatsApp number is not saved in settings. Manual handoff still works,
          but Dossier cannot confirm your preferred sending number.
          <div className="button-row">
            <Link className="button secondary" href="/settings">
              Open settings
            </Link>
          </div>
        </div>
      ) : null}

      <div className="form-grid two">
        <label>
          Message type
          <select
            value={messageType}
            onChange={(event) => setMessageType(event.currentTarget.value as MessageType)}
          >
            {messageTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Upload link
          <input
            readOnly
            placeholder="Generate a secure upload link"
            value={uploadLink}
          />
          <span className="muted">
            {uploadLink && messageHasLatestUploadLink
              ? "Current upload link is included in the WhatsApp message."
              : "Generate an upload link to include it in the WhatsApp message."}
          </span>
        </label>
      </div>

      {uploadLink && !messageHasLatestUploadLink ? (
        <div className="alert info">
          This message does not include the latest upload link.
          <div className="button-row">
            <button
              className="button secondary"
              disabled={isPending}
              type="button"
              onClick={insertLatestUploadLink}
            >
              Insert latest upload link
            </button>
          </div>
        </div>
      ) : null}

      <div className="button-row">
        <button
          className="button secondary"
          disabled={isPending}
          type="button"
          onClick={generateUploadLink}
        >
          {uploadLink ? "Regenerate upload link" : "Generate upload link"}
        </button>
        <button
          className="button secondary"
          disabled={isPending}
          type="button"
          onClick={generateDraft}
        >
          {isPending ? "Working..." : body ? "Regenerate message" : "Generate message"}
        </button>
      </div>

      <label>
        Editable WhatsApp message
        <textarea
          className="message-box"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={10}
        />
      </label>

      {status ? <div className="alert info">{status}</div> : null}

      {isManualHandoff ? (
        <div className="panel compact">
          <span className="eyebrow">WhatsApp preview</span>
          {phonePreview ? (
            <>
              <strong>WhatsApp will open chat with: {phonePreview}</strong>
              <p className="muted">
                Student WhatsApp: {phonePreview}
              </p>
            </>
          ) : (
            <p className="muted">Add a valid student WhatsApp number first.</p>
          )}
        </div>
      ) : null}

      <div className="button-row">
        <button
          className="button secondary"
          disabled={!canSend || isPending}
          type="button"
          onClick={copyMessage}
        >
          Copy message
        </button>

        {isManualHandoff ? (
          <button
            className="button secondary"
            disabled={!whatsappUrl || isPending}
            type="button"
            onClick={copyWhatsAppLink}
          >
            Copy WhatsApp link
          </button>
        ) : null}

        {isManualHandoff ? (
          <>
            {canOpenManual && whatsappUrl && !isPending ? (
              <a
                className="button"
                href={whatsappUrl}
                rel="noopener noreferrer"
                target="_blank"
                onClick={logManualWhatsAppOpen}
              >
                Open in WhatsApp
              </a>
            ) : (
              <button
                className="button"
                disabled
                type="button"
                onClick={() => {
                  setStatus(
                    !phoneValidation.ok
                      ? phoneValidation.error
                      : !canSend
                        ? "Generate a message first."
                        : "Generate an upload link first."
                  );
                }}
              >
                {isPending ? "Opening..." : "Open in WhatsApp"}
              </button>
            )}
            <button
              className="button secondary"
              disabled={!canMarkSent || isPending}
              type="button"
              onClick={markAsSent}
            >
              {isPending ? "Saving..." : "Mark as sent"}
            </button>
          </>
        ) : (
          <SendWhatsAppButton
            disabled={!canSend}
            isPending={isPending}
            onSend={sendMessage}
          />
        )}

      </div>

      {isManualHandoff ? (
        <p className="muted">
          Student chat links always use the student&apos;s phone number. Your saved
          WhatsApp number is used only for display, warnings, and the optional signature.
          {consultantDisplayName ? ` Current sender name: ${consultantDisplayName}.` : ""}
        </p>
      ) : (
        <p className="muted">
          Sandbox/testing mode: messages are sent using Twilio Sandbox.
          Production agency-owned sender will be added later.
        </p>
      )}

      {!studentPhone ? (
        <p className="muted">Add a valid student WhatsApp number first.</p>
      ) : !phoneValidation.ok ? (
        <p className="muted">{phoneValidation.error}</p>
      ) : null}
      {needsUploadLink && !uploadLink ? (
        <p className="muted">Generate an upload link first.</p>
      ) : null}
      {isManualHandoff && communicationSettingsError ? (
        <p className="muted">
          Manual WhatsApp handoff will be available after the communication tables are ready.
        </p>
      ) : null}
      <div className="section-title">
        <div>
          <h2>Email follow-up</h2>
          <p>
            Generate a follow-up draft and send it from your connected Gmail or
            Google Workspace mailbox.
          </p>
        </div>
      </div>

      {!gmailConnected ? (
        <div className="alert info">
          Connect Gmail in Communication Settings first.
          <div className="button-row">
            <Link className="button secondary" href="/settings">
              Open settings
            </Link>
          </div>
        </div>
      ) : (
        <div className="alert success">
          Gmail connected as {gmailConnectedEmail}.
        </div>
      )}

      {emailStatus ? (
        <div className={`alert ${emailStatusTone}`}>
          {emailStatus}
        </div>
      ) : null}

      <div className="form-grid single">
        <label>
          Subject
          <input
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.currentTarget.value)}
            placeholder="Missing documents for your application"
          />
        </label>
      </div>

      <label>
        Editable email body
        <textarea
          className="message-box"
          value={emailBody}
          onChange={(event) => setEmailBody(event.currentTarget.value)}
          rows={12}
        />
      </label>

      <div className="form-grid single">
        <label>
          Email upload link status
          <input
            readOnly
            value={
              uploadLink && emailHasLatestUploadLink
                ? "Current upload link is included in the email."
                : "Generate or insert the latest upload link before sending."
            }
          />
        </label>
      </div>

      {uploadLink && !emailHasLatestUploadLink ? (
        <div className="alert info">
          This email draft does not include the latest upload link.
          <div className="button-row">
            <button
              className="button secondary"
              disabled={isPending}
              type="button"
              onClick={insertLatestEmailUploadLink}
            >
              Insert latest upload link
            </button>
          </div>
        </div>
      ) : null}

      <div className="button-row">
        <button
          className="button secondary"
          disabled={isPending}
          type="button"
          onClick={generateEmailDraft}
        >
          {isPending ? "Working..." : "Generate email"}
        </button>
        <button
          className="button secondary"
          disabled={!canSendEmail || isPending}
          type="button"
          onClick={copyEmailDraft}
        >
          Copy email
        </button>
        <button
          className="button"
          disabled={
            isPending ||
            !hasValidStudentEmail ||
            !gmailConnected ||
            !canSendEmail ||
            (messageType !== "file_complete" && !emailHasLatestUploadLink)
          }
          type="button"
          onClick={sendEmailMessage}
        >
          {isPending ? "Sending..." : "Send from connected Gmail"}
        </button>
      </div>

      {!studentEmail ? (
        <p className="muted">Add student email first.</p>
      ) : !hasValidStudentEmail ? (
        <p className="muted">Add a valid student email first.</p>
      ) : null}
    </section>
  );
}
