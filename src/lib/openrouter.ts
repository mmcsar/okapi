import { friendlyLlmError } from "@/lib/llm-errors";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | {
            type: "image_url";
            image_url: { url: string };
          }
      >;
};

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function openRouterModel() {
  return (
    process.env.OPENROUTER_MODEL?.trim() ||
    "google/gemini-2.5-flash-lite-preview"
  );
}

/** Non-streaming completion (good for HTML generate). */
export async function openRouterComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY manquante");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": "Okapi by MMC SARL",
    },
    body: JSON.stringify({
      model: openRouterModel(),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ] satisfies ChatMessage[],
      max_tokens: opts.maxTokens ?? 8192,
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  } | null;

  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenRouter ${res.status}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("OpenRouter a renvoyé une réponse vide.");
  return text;
}

/** Streaming text response for chat. */
export async function streamOpenRouterChat(opts: {
  system: string;
  messages: ChatMessage[];
}): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY manquante");

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": "Okapi by MMC SARL",
    },
    body: JSON.stringify({
      model: openRouterModel(),
      stream: true,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages,
      ],
      max_tokens: 8192,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const fail = (await upstream.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(fail?.error?.message || `OpenRouter ${upstream.status}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const readable = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[];
              };
              const piece = json.choices?.[0]?.delta?.content;
              if (piece) controller.enqueue(encoder.encode(piece));
            } catch {
              /* skip bad chunk */
            }
          }
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
    },
  });
}
