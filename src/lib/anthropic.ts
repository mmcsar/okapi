import Anthropic from "@anthropic-ai/sdk";

export function anthropicConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function anthropicModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
}

/** Completion Studio / tâches longues. Ne renvoie que le texte visible. */
export async function claudeComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  onChunk?: (text: string) => void;
}) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("empty_response");

  const anthropic = new Anthropic({ apiKey: key });
  // Le raisonnement du modèle compte dans max_tokens : marge pour le JSON Studio.
  const maxTokens = Math.min(32_000, Math.max(opts.maxTokens ?? 12_000, 16_000));
  const params = {
    model: anthropicModel(),
    max_tokens: maxTokens,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.user }],
  };

  if (!opts.onChunk) {
    const res = await anthropic.messages.create(params);
    const text = res.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) throw new Error("empty_response");
    return text;
  }

  const stream = anthropic.messages.stream(params);
  let assembled = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      assembled += event.delta.text;
      opts.onChunk(event.delta.text);
    }
  }
  const text = assembled.trim();
  if (!text) throw new Error("empty_response");
  return text;
}
