import "server-only";

import * as Sentry from "@sentry/nextjs";

import {
  isSentryConfigured as hasSentryConfiguration
} from "@/lib/server-env";

export function isSentryConfigured() {
  return hasSentryConfiguration();
}

type AppErrorContext = {
  module?: string;
  action: string;
  provider?: string;
  agencyId?: string | null;
  studentId?: string | null;
  documentId?: string | null;
  extra?: Record<string, unknown>;
};

const sensitiveKeyPattern =
  /api.?key|secret|authorization|password|token|signed.?url|raw.?text|document.?text|phone/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>);
  }

  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}[truncated]`;
  }

  return value;
}

function sanitizeRecord(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      sanitizeValue(key, value)
    ])
  );
}

export function captureAppError(error: unknown, context: AppErrorContext) {
  if (!isSentryConfigured()) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.module) {
      scope.setTag("module", context.module);
    }

    scope.setTag("action", context.action);

    if (context.provider) {
      scope.setTag("provider", context.provider);
    }

    const identifiers = sanitizeRecord({
      agency_id: context.agencyId,
      student_id: context.studentId,
      document_id: context.documentId
    });
    scope.setContext("identifiers", identifiers);

    if (context.extra) {
      scope.setContext("extra", sanitizeRecord(context.extra));
    }

    Sentry.captureException(error);
  });
}

export function captureServerError(
  error: unknown,
  context?: {
    module?: string;
    action?: string;
    extra?: Record<string, unknown>;
  }
) {
  captureAppError(error, {
    module: context?.module,
    action: context?.action || "server_error",
    extra: context?.extra
  });
}
