import { NextResponse } from "next/server";

import {
  directUploadPrepareSchema,
  prepareDirectDocumentUpload
} from "@/lib/upload/upload-document-server";
import { captureAppError } from "@/lib/monitoring/sentry";

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function statusForUploadError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("invalid") || message.includes("not found")) {
    return 404;
  }

  if (message.includes("expired") || message.includes("not valid")) {
    return 403;
  }

  if (
    message.includes("too large") ||
    message.includes("must be") ||
    message.includes("choose")
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = directUploadPrepareSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError("Upload request is missing required details.");
    }

    const prepared = await prepareDirectDocumentUpload(parsed.data);

    return NextResponse.json({
      ok: true,
      ...prepared
    });
  } catch (error) {
    console.error("[upload-document] prepare failed", error);
    captureAppError(error, {
      module: "upload",
      action: "signed_upload_prepare_route"
    });

    return jsonError(
      error instanceof Error
        ? error.message
        : "Could not prepare this upload. Please try again.",
      statusForUploadError(error)
    );
  }
}
