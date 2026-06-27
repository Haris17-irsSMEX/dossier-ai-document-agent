import { NextResponse } from "next/server";

import { scanDocumentForCurrentProfile } from "@/lib/actions/document-scans";

export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await context.params;
    const result = await scanDocumentForCurrentProfile(documentId);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Document scan failed."
      },
      { status: 500 }
    );
  }
}
