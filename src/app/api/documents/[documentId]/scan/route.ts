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
    console.error("[document-scan] route failed", error);
    return NextResponse.json(
      {
        ok: false,
        message: "AI scan failed. Manual review needed."
      },
      { status: 500 }
    );
  }
}
