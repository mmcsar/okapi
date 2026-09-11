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

  // Auto (no LLM_PROVIDER): OpenAI → OpenRouter → Claude. Gemini only if forced.
  if (openAiConfigured()) return "openai";
  if (openRouterConfigured()) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "claude";
  return null;
}

export function missingLlmMessage() {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (forced === "openai") {
    return "LLM_PROVIDER=openai mais OPENAI_API_KEY est vide. Ajoute la clé sur Vercel (ou .env.local) puis redeploy / redémarre.";
  }
  if (forced === "openrouter") {
    return "LLM_PROVIDER=openrouter mais OPENROUTER_API_KEY est vide.";
  }
  if (forced === "claude") {
    return "LLM_PROVIDER=claude mais ANTHROPIC_API_KEY est vide.";
  }
  if (forced === "gemini") {
    return "LLM_PROVIDER=gemini mais GEMINI_API_KEY est vide.";
  }
  return "Aucune clé LLM. Sur Vercel / .env.local : OPENAI_API_KEY + LLM_PROVIDER=openai.";
}
