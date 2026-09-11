import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type OpenAiChatMessage = ChatCompletionMessageParam;

export function openAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function openAiModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

function client() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY manquante");
  return new OpenAI({ apiKey: key });
}

/** Non-streaming completion (HTML generate). */
export async function openAiComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}) {
  const openai = client();
  const res = await openai.chat.completions.create({
    model: openAiModel(),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens ?? 8192,
  });

  const text = res.choices[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenAI a renvoyé une réponse vide.");
  return text;
}

/** Streaming text response for chat. */
export async function streamOpenAiChat(opts: {
  system: string;
  messages: Array<{
    role: "user" | "assistant";
    content:
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        >;
  }>;
}): Promise<Response> {
  const openai = client();
  const stream = await openai.chat.completions.create({
    model: openAiModel(),
    stream: true,
    messages: [
      { role: "system", content: opts.system },
      ...(opts.messages as OpenAiChatMessage[]),
    ],
    max_completion_tokens: 8192,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const piece = chunk.choices[0]?.delta?.content;
          if (piece) controller.enqueue(encoder.encode(piece));
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur OpenAI";
        controller.enqueue(encoder.encode(`\n\n[Erreur Okapi] ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Okapi-Provider": "openai",
    },
  });
}
