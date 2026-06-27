import "server-only";

import { createDeepSeekClient } from "@/lib/ai/deepseek";
import {
  documentCheckResultSchema,
  type DocumentCheckResult
} from "@/lib/ai/document-check-schema";
import { getDeepSeekEnv } from "@/lib/server-env";
import { captureServerError } from "@/lib/monitoring/sentry";

export type DocumentCheckInput = {
  student: {
    full_name: string;
    email?: string | null;
    phone?: string | null;
    target_country?: string | null;
    destination_country?: string | null;
    program_level?: string | null;
    education_background?: string | null;
    sponsor_type?: string | null;
  };
  checklistItem: {
    document_name: string;
    category: string;
    instructions?: string | null;
    accepted_formats: string[];
    upload_type: string;
    required_parts?: unknown;
    expiry_validation_enabled?: boolean | null;
  };
  document: {
    original_filename: string;
    mime_type?: string | null;
    file_size_bytes?: number | null;
  };
  documentPart?: {
    part_name: string;
    is_required: boolean;
  } | null;
  ocr: {
    rawText: string;
    confidence?: number | null;
  };
};

const SYSTEM_PROMPT = [
  "You validate study-abroad and immigration application documents for a consultant.",
  "Return strict JSON only. Do not include Markdown, comments, or prose outside JSON.",
  "Use only the provided OCR text and metadata. Do not invent fields that are not visible.",
  "Do not call any document fake. Use suspicious or needs_manual_review when evidence is concerning.",
  "Do not mark official verification as completed. AI can only recommend official_verification_required.",
  "Never recommend rejected or officially_verified."
].join(" ");

const OUTPUT_SHAPE = {
  detected_document_type: "string",
  confidence: 0.0,
  extracted_fields: {
    full_name: "string|null",
    father_name: "string|null",
    date_of_birth: "string|null",
    document_number: "string|null",
    issue_date: "string|null",
    expiry_date: "string|null",
    institution_name: "string|null",
    board_or_university: "string|null",
    marks_or_grade: "string|null",
    account_holder: "string|null",
    statement_date: "string|null"
  },
  issues: [
    {
      type: "wrong_document|wrong_format|blurry|cropped|missing_page|expired|name_mismatch|low_confidence|attestation_missing|needs_manual_review|suspicious",
      severity: "low|medium|high",
      message: "string",
      evidence: "string",
      recommended_action: "string"
    }
  ],
  needs_human_review: false,
  recommended_status:
    "accepted|needs_review|suspicious|official_verification_required"
};

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n[OCR text truncated]`;
}

function parseJson(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(withoutFence);
}

function buildPrompt(input: DocumentCheckInput) {
  return [
    "Validate this uploaded document against the requested checklist item.",
    "",
    `Required JSON shape: ${JSON.stringify(OUTPUT_SHAPE)}`,
    "",
    `Student profile: ${JSON.stringify(input.student)}`,
    `Checklist item: ${JSON.stringify(input.checklistItem)}`,
    `Document part: ${JSON.stringify(input.documentPart ?? null)}`,
    `File metadata: ${JSON.stringify(input.document)}`,
    `OCR confidence: ${input.ocr.confidence ?? "unknown"}`,
    "",
    "OCR text:",
    truncateText(input.ocr.rawText, 12000)
  ].join("\n");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown DeepSeek error.";
}

export async function checkDocumentWithDeepSeek(
  input: DocumentCheckInput
): Promise<DocumentCheckResult> {
  const env = getDeepSeekEnv();
  const client = createDeepSeekClient();

  try {
    const completion = await client.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildPrompt(input)
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      throw new Error("DeepSeek returned an empty document check.");
    }

    const parsed = documentCheckResultSchema.safeParse(parseJson(content));

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || "Invalid JSON shape.");
    }

    return parsed.data;
  } catch (error) {
    captureServerError(error, {
      module: "ai",
      action: "deepseek.checkDocument",
      extra: {
        filename: input.document.original_filename,
        documentName: input.checklistItem.document_name
      }
    });
    throw new Error(`DeepSeek document validation failed: ${errorMessage(error)}`);
  }
}
