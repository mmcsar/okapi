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
/** Pro par défaut (payant) — retombe sur FREE_FALLBACK_MODEL si 402. */
const DEFAULT_PRO_MODEL = "openai/gpt-4o";
/** Flash par défaut : gratuit pour RDC sans crédit. */
const DEFAULT_FLASH_MODEL = FREE_FALLBACK_MODEL;
/** Fallback vision (doit supporter les images). */
const FREE_VISION_FALLBACK =
  process.env.OPENROUTER_MODEL_VISION_FREE?.trim() ||
  "google/gemini-2.0-flash-exp:free";

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY manquante");
  return key;
}

export function openRouterModel(
  engine: OkapiEngine = "flash",
  opts?: { vision?: boolean },
) {
  if (opts?.vision) {
    return (
      process.env.OPENROUTER_MODEL_VISION?.trim() ||
      (engine === "pro"
        ? process.env.OPENROUTER_MODEL_PRO?.trim()
        : process.env.OPENROUTER_MODEL_FLASH?.trim()) ||
      process.env.OPENROUTER_MODEL?.trim() ||
      "google/gemini-2.0-flash-001"
    );
  }
  if (engine === "pro") {
    return (
      process.env.OPENROUTER_MODEL_PRO?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      DEFAULT_PRO_MODEL
    );
  }
  return (
    process.env.OPENROUTER_MODEL_FLASH?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_FLASH_MODEL
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

/** Read OpenRouter SSE body → full text, optional per-delta callback. */
async function consumeOpenRouterSse(
  body: ReadableStream<Uint8Array>,
  onChunk?: (text: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let assembled = "";
  /** Dernier snapshot cumulatif (certains modèles renvoient le texte entier à chaque chunk). */
  let lastSnapshot = "";

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
            delta?: { content?: string | null; text?: string | null };
            message?: { content?: string | null };
            text?: string;
          }[];
          error?: { message?: string };
        };
        if (json.error?.message) {
          throw new Error(json.error.message);
        }
        const piece =
          json.choices?.[0]?.delta?.content ??
          json.choices?.[0]?.delta?.text ??
          json.choices?.[0]?.message?.content ??
          json.choices?.[0]?.text ??
          "";
        if (!piece || typeof piece !== "string") continue;

        let neu = piece;
        // Snapshot cumulatif : n’émettre que le suffixe nouveau
        if (lastSnapshot && piece.startsWith(lastSnapshot) && piece.length > lastSnapshot.length) {
          neu = piece.slice(lastSnapshot.length);
          lastSnapshot = piece;
        } else if (lastSnapshot && lastSnapshot.startsWith(piece) && piece.length < lastSnapshot.length) {
          // Chunk plus court que le snapshot = bruit, ignorer
          neu = "";
        } else {
          // Delta classique
          lastSnapshot += piece;
        }
        if (neu) {
          assembled += neu;
          onChunk?.(neu);
        }
      } catch (err) {
        if (err instanceof Error && err.message && !err.message.includes("JSON")) {
          throw err;
        }
        /* skip bad chunk */
      }
    }
  }

  return assembled.trim();
}

/** Completion — stream tokens via onChunk when provided (Agent live code). */
export async function openRouterComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  engine?: OkapiEngine;
  onChunk?: (text: string) => void;
}) {
  const key = requireOpenRouterKey();

  const primary = openRouterModel(opts.engine ?? "flash");
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  // Free models: plafonner — trop de tokens → refus / réponse vide fréquente
  const rawMax = opts.maxTokens ?? 8192;
  const maxTokens =
    /:free$/i.test(primary) || primary === FREE_FALLBACK_MODEL
      ? Math.min(rawMax, 6000)
      : rawMax;
  const wantStream = Boolean(opts.onChunk);

  async function once(model: string, stream: boolean): Promise<string> {
    let res = await openRouterFetch({
      key,
      model,
      messages,
      maxTokens,
      stream,
    });

    if (!res.ok) {
      const failBody = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const msg = failBody?.error?.message || "";
      if (
        isPaymentBlocked(res.status, msg) &&
        model !== FREE_FALLBACK_MODEL
      ) {
        return once(FREE_FALLBACK_MODEL, stream);
      }
      throw new Error(
        msg ||
          (res.status === 402
            ? "Le crédit IA Okapi est épuisé."
            : res.status === 429
              ? "Okapi reçoit beaucoup de demandes. Réessaie dans un instant."
              : `Erreur IA Okapi (${res.status})`),
      );
    }

    if (stream) {
      if (!res.body) throw new Error("Okapi a renvoyé une réponse vide.");
      return consumeOpenRouterSse(res.body, opts.onChunk);
    }

    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    } | null;
    if (!res.ok) {
      throw new Error(
        data?.error?.message ||
          (res.status === 402
            ? "Le crédit IA Okapi est épuisé."
            : `Erreur IA Okapi (${res.status})`),
      );
    }
    return data?.choices?.[0]?.message?.content?.trim() || "";
  }

  let text = await once(primary, wantStream);

  // Stream vide → 1 retry non-stream (souvent plus fiable sur :free)
  if (!text && wantStream) {
    text = await once(primary, false);
    if (text && opts.onChunk) opts.onChunk(text);
  }

  // Toujours vide → autre modèle free
  if (!text && primary !== FREE_FALLBACK_MODEL) {
    text = await once(FREE_FALLBACK_MODEL, false);
    if (text && opts.onChunk) opts.onChunk(text);
  }

  if (!text) throw new Error("Okapi a renvoyé une réponse vide.");
  return text;
}

/** Streaming text response for chat. */
export async function streamOpenRouterChat(opts: {
  system: string;
  engine?: OkapiEngine;
  messages: ChatMessage[];
  vision?: boolean;
}): Promise<Response> {
  const key = requireOpenRouterKey();

  const vision = Boolean(opts.vision);
  const primary = openRouterModel(opts.engine ?? "flash", { vision });
  const fallback = vision ? FREE_VISION_FALLBACK : FREE_FALLBACK_MODEL;
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

  if (!upstream.ok) {
    const failBody = (await upstream.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const msg = failBody?.error?.message || "";
    const canRetry =
      primary !== fallback &&
      (isPaymentBlocked(upstream.status, msg) ||
        (vision &&
          /vision|image|multimodal|content type|not support/i.test(msg)));

    if (canRetry) {
      upstream = await openRouterFetch({
        key,
        model: fallback,
        messages,
        maxTokens: 8192,
        stream: true,
      });
    } else {
      throw new Error(
        msg ||
          (upstream.status === 402
            ? "Le crédit IA Okapi est épuisé."
            : upstream.status === 429
              ? "Okapi reçoit beaucoup de demandes. Réessaie dans un instant."
              : `Erreur IA Okapi (${upstream.status})`),
      );
    }
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

              let neu = piece;
              if (assembled && piece.startsWith(assembled) && piece.length > assembled.length) {
                neu = piece.slice(assembled.length);
                assembled = piece;
              } else if (assembled && assembled.startsWith(piece) && piece.length < assembled.length) {
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
