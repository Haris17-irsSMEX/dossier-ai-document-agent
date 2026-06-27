import "server-only";

import OpenAI from "openai";

import { getDeepSeekEnv } from "@/lib/server-env";
import { captureServerError } from "@/lib/monitoring/sentry";
import type { AiFollowUpRequest, AiFollowUpResult } from "@/lib/types";

const SYSTEM_PROMPT = [
  "You write concise WhatsApp follow-up messages for study-abroad and immigration consultants.",
  "Be specific about missing, wrong, blurry, or expired documents.",
  "Do not mention internal systems, API providers, or unverifiable official integrations.",
  "Keep the message professional, human, and easy for a student to act on."
].join(" ");

let deepSeekClient: OpenAI | null = null;

export function createDeepSeekClient() {
  const env = getDeepSeekEnv();

  if (!deepSeekClient) {
    deepSeekClient = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL
    });
  }

  return deepSeekClient;
}

function formatList(label: string, values?: string[]) {
  if (!values?.length) {
    return `${label}: none`;
  }

  return `${label}: ${values.join(", ")}`;
}

function buildFollowUpPrompt(input: AiFollowUpRequest) {
  const verificationSummary =
    input.verificationSteps
      ?.map((step) => `${step.label} (${step.authority}): ${step.status}`)
      .join("; ") || "none";

  return [
    `Student: ${input.studentName}`,
    `Consultant: ${input.consultantName || "the consultant"}`,
    `Agency: ${input.agencyName || "the agency"}`,
    `Destination: ${input.destinationCountry || "not specified"}`,
    `Institution: ${input.targetInstitution || "not specified"}`,
    `Deadline: ${input.deadline || "not specified"}`,
    `Tone: ${input.tone || "friendly"}`,
    formatList("Missing documents", input.missingDocuments),
    formatList("Wrong documents", input.wrongDocuments),
    formatList("Blurry documents", input.blurryDocuments),
    formatList("Expired documents", input.expiredDocuments),
    `Verification workflow: ${verificationSummary}`,
    "Write one WhatsApp-ready message under 900 characters. Include a clear next action."
  ].join("\n");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function generateDeepSeekFollowUpMessage(
  input: AiFollowUpRequest
): Promise<AiFollowUpResult> {
  const env = getDeepSeekEnv();
  const client = createDeepSeekClient();

  try {
    const completion = await client.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildFollowUpPrompt(input)
        }
      ]
    });

    const message = completion.choices[0]?.message?.content?.trim();

    if (!message) {
      throw new Error("DeepSeek returned an empty follow-up message.");
    }

    return {
      provider: "deepseek",
      model: env.DEEPSEEK_MODEL,
      message,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens
          }
        : undefined
    };
  } catch (error) {
    captureServerError(error, {
      module: "ai",
      action: "deepseek.generateFollowUpMessage",
      extra: {
        studentName: input.studentName,
        destinationCountry: input.destinationCountry
      }
    });
    throw new Error(
      `DeepSeek message generation failed: ${getErrorMessage(error)}`
    );
  }
}
