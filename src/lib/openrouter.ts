import { friendlyLlmError } from "@/lib/llm-errors";
import type { OkapiEngine } from "@/lib/okapi-engine";

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

/** Gratuit OpenRouter — utilisé si pas de crédit / modèle payant refusé. */
const FREE_FALLBACK_MODEL = "nex-agi/nex-n2.5-mini:free";

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function openRouterModel(engine: OkapiEngine = "flash") {
  if (engine === "pro") {
    return (
      process.env.OPENROUTER_MODEL_PRO?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      FREE_FALLBACK_MODEL
    );
  }
  return (
    process.env.OPENROUTER_MODEL_FLASH?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    FREE_FALLBACK_MODEL
  );
}

function isPaymentBlocked(status: number, message?: string) {
  return (
    status === 402 ||
    /payment required|no credits|insufficient|can only afford|billing/i.test(
      message || "",
    )
  );
}

function openRouterHeaders(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer":
      process.env.OPENROUTER_SITE_URL || "https://okapi-elf9.vercel.app",
    "X-Title": "Okapi by MMC SARL",
  };
}

async function openRouterFetch(opts: {
  key: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  stream?: boolean;
}) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(opts.key),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      stream: opts.stream === true,
    }),
  });
}

/** Non-streaming completion (good for HTML generate). */
export async function openRouterComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  engine?: OkapiEngine;
}) {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY manquante");

  const primary = openRouterModel(opts.engine ?? "flash");
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const maxTokens = opts.maxTokens ?? 8192;

  let res = await openRouterFetch({
    key,
    model: primary,
    messages,
    maxTokens,
  });

  let data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  } | null;

  if (
    !res.ok &&
    isPaymentBlocked(res.status, data?.error?.message) &&
    primary !== FREE_FALLBACK_MODEL
  ) {
    res = await openRouterFetch({
      key,
      model: FREE_FALLBACK_MODEL,
      messages,
      maxTokens,
    });
    data = (await res.json().catch(() => null)) as typeof data;
  }

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        (res.status === 402
          ? "Le crédit IA Okapi est épuisé."
          : res.status === 429
            ? "Okapi reçoit beaucoup de demandes. Réessaie dans un instant."
            : `Erreur IA Okapi (${res.status})`),
    );
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error("Okapi a renvoyé une réponse vide.");
  return text;
}

/** Streaming text response for chat. */
export async function streamOpenRouterChat(opts: {
  system: string;
  engine?: OkapiEngine;
  messages: ChatMessage[];
}): Promise<Response> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY manquante");

  const primary = openRouterModel(opts.engine ?? "flash");
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    ...opts.messages,
  ];

  let upstream = await openRouterFetch({
    key,
    model: primary,
    messages,
    maxTokens: 8192,
    stream: true,
  });

  if (
    !upstream.ok &&
    isPaymentBlocked(upstream.status) &&
    primary !== FREE_FALLBACK_MODEL
  ) {
    upstream = await openRouterFetch({
      key,
      model: FREE_FALLBACK_MODEL,
      messages,
      maxTokens: 8192,
      stream: true,
    });
  }

  if (!upstream.ok || !upstream.body) {
    const fail = (await upstream.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      fail?.error?.message ||
        (upstream.status === 402
          ? "Le crédit IA Okapi est épuisé."
          : upstream.status === 429
            ? "Okapi reçoit beaucoup de demandes. Réessaie dans un instant."
            : `Erreur IA Okapi (${upstream.status})`),
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const readable = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let assembled = "";
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
                choices?: {
                  delta?: { content?: string };
                  message?: { content?: string };
                }[];
              };
              const piece =
                json.choices?.[0]?.delta?.content ??
                json.choices?.[0]?.message?.content;
              if (!piece) continue;

              // Certains modèles envoient le texte cumulatif à chaque chunk
              // (pas un delta) → on n’émet que la partie nouvelle.
              let neu = piece;
              if (assembled && piece.startsWith(assembled)) {
                neu = piece.slice(assembled.length);
                assembled = piece;
              } else if (assembled && assembled.endsWith(piece)) {
                neu = "";
              } else {
                assembled += piece;
              }
              if (neu) controller.enqueue(encoder.encode(neu));
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
