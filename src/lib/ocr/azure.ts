import "server-only";

import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
  type AnalyzeOperationOutput
} from "@azure-rest/ai-document-intelligence";

import {
  getAzureDocumentIntelligenceEnv,
  isAzureConfigured
} from "@/lib/server-env";
import { captureServerError } from "@/lib/monitoring/sentry";

export type AzureOcrResult = {
  provider: "azure_document_intelligence";
  model: "prebuilt-read";
  rawText: string;
  confidence: number | null;
  metadata: Record<string, unknown>;
};

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }

  return "Unknown Azure OCR error.";
}

export function isAzureOcrConfigured() {
  return isAzureConfigured();
}

export async function extractTextWithAzureDocumentIntelligence(input: {
  fileBytes: Buffer;
  mimeType?: string | null;
  filename?: string | null;
}): Promise<AzureOcrResult> {
  const env = getAzureDocumentIntelligenceEnv();
  const client = DocumentIntelligence(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT, {
    key: env.AZURE_DOCUMENT_INTELLIGENCE_KEY
  });

  try {
    const initialResponse = await client
      .path("/documentModels/{modelId}:analyze", "prebuilt-read")
      .post({
        contentType: "application/json",
        body: {
          base64Source: input.fileBytes.toString("base64")
        }
      });

    if (isUnexpected(initialResponse)) {
      throw new Error(initialResponse.body.error.message);
    }

    const poller = getLongRunningPoller(client, initialResponse);
    const result = (await poller.pollUntilDone()).body as AnalyzeOperationOutput;

    if (result.status !== "succeeded" || !result.analyzeResult) {
      throw new Error(result.error?.message || "Azure OCR did not complete.");
    }

    const analyzeResult = result.analyzeResult;
    const wordConfidences =
      analyzeResult.pages.flatMap((page) =>
        (page.words ?? []).map((word) => word.confidence)
      ) ?? [];

    return {
      provider: "azure_document_intelligence",
      model: "prebuilt-read",
      rawText: analyzeResult.content || "",
      confidence: average(wordConfidences),
      metadata: {
        api_version: analyzeResult.apiVersion,
        model_id: analyzeResult.modelId,
        content_format: analyzeResult.contentFormat ?? "text",
        page_count: analyzeResult.pages.length,
        languages: analyzeResult.languages ?? [],
        warnings: analyzeResult.warnings ?? [],
        mime_type: input.mimeType,
        filename: input.filename
      }
    };
  } catch (error) {
    captureServerError(error, {
      module: "ocr",
      action: "azure.extractText",
      extra: {
        filename: input.filename,
        mimeType: input.mimeType
      }
    });
    throw new Error(`Azure OCR failed: ${errorMessage(error)}`);
  }
}
