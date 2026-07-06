import "server-only";

import crypto from "node:crypto";

import {
  getGmailAccessToken,
  getGmailRefreshToken,
  markGmailConnectionExpired,
  touchGmailConnectionLastUsed,
  updateGmailConnectionTokens
} from "@/lib/integrations/google/gmail-connection";
import { refreshGoogleAccessToken } from "@/lib/integrations/google/gmail-oauth";
import { captureAppError } from "@/lib/monitoring/sentry";
import type { EmailConnection } from "@/lib/types";

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtmlParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) =>
      `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

function buildRawEmail(input: {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  replyTo?: string;
}) {
  const headers = [
    `To: ${sanitizeHeaderValue(input.to)}`,
    `From: ${sanitizeHeaderValue(input.from)}`,
    `Subject: ${sanitizeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0"
  ];

  if (input.replyTo?.trim()) {
    headers.push(`Reply-To: ${sanitizeHeaderValue(input.replyTo)}`);
  }

  if (input.htmlBody?.trim()) {
    const boundary = `dossier_${crypto.randomUUID().replace(/-/g, "")}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      input.textBody,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      input.htmlBody,
      "",
      `--${boundary}--`
    ].join("\r\n");
  }

  return [
    ...headers,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.textBody
  ].join("\r\n");
}

async function ensureFreshAccessToken(connection: EmailConnection) {
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  const isFresh = expiresAt && expiresAt - Date.now() > REFRESH_BUFFER_MS;

  if (isFresh) {
    return {
      connection,
      accessToken: await getGmailAccessToken(connection)
    };
  }

  try {
    const refreshToken = await getGmailRefreshToken(connection);
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    const updatedConnection = await updateGmailConnectionTokens(connection.id, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || refreshToken,
      tokenExpiresAt: refreshed.tokenExpiresAt,
      scopes: refreshed.scopes.length ? refreshed.scopes : connection.scopes,
      status: "connected"
    });

    return {
      connection: updatedConnection,
      accessToken: refreshed.accessToken
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Gmail token refresh failed", {
        connectionId: connection.id,
        message: error instanceof Error ? error.message : "Unknown refresh error"
      });
    }

    try {
      await markGmailConnectionExpired(connection.id);
    } catch (markError) {
      captureAppError(markError, {
        module: "gmail",
        action: "gmail_mark_expired",
        provider: "google"
      });
    }

    throw new Error("Gmail connection expired. Please reconnect Gmail.");
  }
}

export async function sendEmailWithConnectedGmail(input: {
  connection: EmailConnection;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  replyTo?: string;
}) {
  if (!input.connection.email_address?.trim()) {
    throw new Error("Connected Gmail address is missing.");
  }

  if (!input.to?.trim()) {
    throw new Error("Recipient email address is missing.");
  }

  if (!input.subject?.trim()) {
    throw new Error("Email subject is required.");
  }

  if (!input.textBody?.trim()) {
    throw new Error("Email body is required.");
  }

  const { connection, accessToken } = await ensureFreshAccessToken(
    input.connection
  );
  const rawEmail = buildRawEmail({
    from: connection.email_address,
    to: input.to,
    subject: input.subject,
    textBody: input.textBody,
    htmlBody:
      input.htmlBody?.trim() || textToHtmlParagraphs(input.textBody),
    replyTo: input.replyTo
  });

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      raw: base64UrlEncode(rawEmail)
    }),
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    const message =
      typeof payload?.error === "object" &&
      payload.error &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Gmail API could not send the email.";

    if (process.env.NODE_ENV !== "production") {
      console.error("Gmail send failed", {
        connectionId: connection.id,
        status: response.status,
        message
      });
    }

    throw new Error(message);
  }

  await touchGmailConnectionLastUsed(connection.id);

  return {
    providerMessageId:
      typeof payload?.id === "string" ? payload.id : "gmail-message",
    fromEmail: connection.email_address
  };
}
