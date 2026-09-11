import { friendlyConfigError } from "@/lib/llm-errors";
import { openAiConfigured } from "@/lib/openai";
import { openRouterConfigured } from "@/lib/openrouter";

export type LlmProvider = "openai" | "openrouter" | "gemini" | "claude";

/** Pick LLM. Never auto-fall back to Gemini (often blocked in DRC). */
export function pickLlmProvider(): LlmProvider | null {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();

  if (forced === "openai") {
    return openAiConfigured() ? "openai" : null;
  }
  if (forced === "openrouter") {
    return openRouterConfigured() ? "openrouter" : null;
  }
  if (forced === "claude") {
    return process.env.ANTHROPIC_API_KEY?.trim() ? "claude" : null;
  }
  if (forced === "gemini") {
    return process.env.GEMINI_API_KEY?.trim() ? "gemini" : null;
  }

  if (openAiConfigured()) return "openai";
  if (openRouterConfigured()) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "claude";
  return null;
}

/** User-facing — never expose env var names or providers. */
export function missingLlmMessage() {
  return friendlyConfigError();
}
