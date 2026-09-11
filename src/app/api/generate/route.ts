import { GoogleGenAI } from "@google/genai";
import { languageInstruction } from "@/lib/i18n";
import {
  friendlyLlmError,
  isLocationBlocked,
  isRetryableLlm,
} from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import { openAiComplete, openAiConfigured } from "@/lib/openai";
import { openRouterComplete, openRouterConfigured } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildSystem(language?: string | null) {
  return `Okapi HTML engine. Generate ONE complete web app as a single HTML file ONLY when asked.

Rules:
1. ONLY the HTML document (start with <!DOCTYPE html>). No markdown.
2. Do only what was requested — no useless bonus sections.
3. Mobile-first. RDC context (WhatsApp / Mobile Money) when asked or clearly useful.
4. Tailwind CDN: https://cdn.tailwindcss.com + inline JS if needed.
5. Compact. Header with project name. Clean design, not generic purple.
6. On edit: return the FULL updated HTML.

${languageInstruction(language)}
For visible UI text in the HTML: use the user's language (or preferred language above).

Reminder: you can be wrong; you are not a doctor or lawyer.`;
}

type Body = {
  message?: string;
  sector?: string;
  language?: string;
  currentHtml?: string;
  stream?: boolean;
};

function extractHtml(text: string) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const doc = trimmed.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (doc?.[0]) return doc[0].trim();
  if (trimmed.includes("<html")) {
    const start = trimmed.indexOf("<!DOCTYPE");
    const alt = trimmed.indexOf("<html");
    const from = start >= 0 ? start : alt;
    if (from >= 0) return trimmed.slice(from).trim();
  }
  return trimmed;
}

function buildPrompt(sector: string, message: string, currentHtml?: string) {
  if (currentHtml) {
    return `Sector: ${sector}
Modify (fast, full HTML):
${message}

Current HTML:
${currentHtml.slice(0, 28000)}`;
  }
  return `Sector: ${sector}
Generate a compact app quickly:
${message}`;
}

function preferProvider() {
  return pickLlmProvider();
}

async function generateOnce(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  system: string,
  onChunk?: (text: string) => void,
) {
  const run = async (withThinking: boolean) => {
    const stream = await ai.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        maxOutputTokens: 4096,
        ...(withThinking
          ? {
              thinkingConfig: {
                thinkingLevel: "minimal",
              },
            }
          : {}),
      } as Parameters<typeof ai.models.generateContentStream>[0]["config"],
    });

    let raw = "";
    for await (const chunk of stream) {
      const piece = chunk.text ?? "";
      if (!piece) continue;
      raw += piece;
      onChunk?.(piece);
    }
    return raw.trim();
  };

  try {
    return await run(true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/thinking|ThinkingConfig|invalid/i.test(msg)) {
      return await run(false);
    }
    throw err;
  }
}

async function generateWithFallback(
  prompt: string,
  system: string,
  onChunk?: (text: string) => void,
  onStatus?: (msg: string) => void,
) {
  const provider = preferProvider();
  if (!provider) {
    throw new Error(missingLlmMessage());
  }

  if (provider === "openai") {
    onStatus?.("OpenAI génère…");
    const text = await openAiComplete({ system, user: prompt });
    onChunk?.(text);
    return text;
  }

  if (provider === "openrouter") {
    onStatus?.("OpenRouter génère…");
    const text = await openRouterComplete({ system, user: prompt });
    onChunk?.(text);
    return text;
  }

  if (provider === "claude") {
    throw new Error(
      "Claude n’est pas branché sur /api/generate. Utilise OPENAI_API_KEY + LLM_PROVIDER=openai.",
    );
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(missingLlmMessage());
  }

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
  const ai = new GoogleGenAI({ apiKey: key });

  try {
    return await generateOnce(ai, model, prompt, system, onChunk);
  } catch (err) {
    if (isRetryableLlm(err)) {
      await new Promise((r) => setTimeout(r, 800));
      return await generateOnce(ai, model, prompt, system, onChunk);
    }
    if (isLocationBlocked(err) && openAiConfigured()) {
      onStatus?.("Gemini bloqué (région) — bascule OpenAI…");
      const text = await openAiComplete({ system, user: prompt });
      onChunk?.(text);
      return text;
    }
    if (isLocationBlocked(err) && openRouterConfigured()) {
      onStatus?.("Gemini bloqué (région) — bascule OpenRouter…");
      const text = await openRouterComplete({ system, user: prompt });
      onChunk?.(text);
      return text;
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const message = body?.message?.trim();
  if (!message) {
    return Response.json({ error: "Message vide." }, { status: 400 });
  }

  if (!pickLlmProvider()) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const sector = body?.sector?.trim() || "Site web";
  const language = body?.language?.trim() || "auto";
  const system = buildSystem(language);
  const currentHtml = body?.currentHtml?.trim();
  const wantStream = body?.stream !== false;
  const prompt = buildPrompt(sector, message, currentHtml);

  const finish = (raw: string) => {
    if (!raw) {
      return {
        error: "Le modèle n’a renvoyé aucun HTML.",
        status: 502 as const,
      };
    }
    const html = extractHtml(raw);
    if (!html.toLowerCase().includes("<html")) {
      return {
        error: "Réponse invalide (pas un document HTML).",
        preview: raw.slice(0, 400),
        status: 502 as const,
      };
    }
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || `Projet ${sector}`;
    return {
      ok: true as const,
      html,
      title,
      summary: currentHtml
        ? `Preview updated: ${title}`
        : `Preview ready: ${title}. Tell me what to change.`,
      status: 200 as const,
    };
  };

  if (!wantStream) {
    try {
      const raw = await generateWithFallback(prompt, system);
      const out = finish(raw);
      if (!("ok" in out) || !out.ok) {
        return Response.json(out, { status: out.status });
      }
      return Response.json(out);
    } catch (err) {
      return Response.json(
        { error: friendlyLlmError(err) },
        { status: 500 },
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        send({ type: "status", message: "Okapi génère…" });
        const raw = await generateWithFallback(
          prompt,
          system,
          (text) => send({ type: "delta", text }),
          (msg) => send({ type: "status", message: msg }),
        );

        const out = finish(raw);
        if (!("ok" in out) || !out.ok) {
          send({
            type: "error",
            error: out.error,
            preview: "preview" in out ? out.preview : undefined,
          });
        } else {
          send({
            type: "done",
            html: out.html,
            title: out.title,
            summary: out.summary,
          });
        }
      } catch (err) {
        send({
          type: "error",
          error: friendlyLlmError(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
