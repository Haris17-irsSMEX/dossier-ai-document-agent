import "server-only";

import { getDeepSeekEnv } from "@/lib/server-env";
import { generateDeepSeekFollowUpMessage } from "@/lib/ai/deepseek";
import type { AiFollowUpRequest, AiFollowUpResult } from "@/lib/types";

export async function generateFollowUpMessage(
  input: AiFollowUpRequest
): Promise<AiFollowUpResult> {
  const env = getDeepSeekEnv();

  switch (env.AI_PROVIDER) {
    case "deepseek":
      return generateDeepSeekFollowUpMessage(input);
    default:
      throw new Error(`Unsupported AI provider: ${env.AI_PROVIDER}`);
  }
}

export const aiProvider = {
  generateFollowUpMessage
};
