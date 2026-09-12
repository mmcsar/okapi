import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { friendlyLlmError } from "@/lib/llm-errors";
import type { OkapiEngine } from "@/lib/okapi-engine";

export type OpenAiChatMessage = ChatCompletionMessageParam;

export function openAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Map produit Flash/Pro → modèles (config serveur uniquement). */
export function openAiModel(engine: OkapiEngine = "flash") {
  if (engine === "pro") {
    return (
      process.env.OPENAI_MODEL_PRO?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "gpt-5"
    );
  }
  return (
    process.env.OPENAI_MODEL_FLASH?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-5-mini"
  );
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
  engine?: OkapiEngine;
}) {
  const openai = client();
  const res = await openai.chat.completions.create({
    model: openAiModel(opts.engine ?? "flash"),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens ?? 8192,
  });

  const text = res.choices[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("empty_response");
  return text;
}

/** Streaming text response for chat. */
export async function streamOpenAiChat(opts: {
  system: string;
  engine?: OkapiEngine;
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
    model: openAiModel(opts.engine ?? "flash"),
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
        controller.enqueue(encoder.encode(`\n\n${friendlyLlmError(err)}`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Okapi-Provider": "okapi",
      "X-Okapi-Engine": opts.engine ?? "flash",
    },
  });
}
