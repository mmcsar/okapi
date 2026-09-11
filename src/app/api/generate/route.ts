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
import {
  parseOkapiArtifacts,
  resolveGenerateMode,
  titleFromHtml,
  type GenerateMode,
} from "@/lib/fullstack";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildSystemHtml(language?: string | null) {
  return `You are Okapi (MMC SARL AI platform) HTML engine. Generate ONE complete web app as a single HTML file ONLY when asked.

Rules:
1. ONLY the HTML document (start with <!DOCTYPE html>). No markdown.
2. Do only what was requested — no useless bonus sections.
3. Mobile-first. RDC context (WhatsApp / Mobile Money) when asked or clearly useful.
4. Tailwind CDN: https://cdn.tailwindcss.com + inline JS if needed.
5. Compact. Header with project name. Clean design, not generic purple.
6. On edit: return the FULL updated HTML.
7. Never mention third-party AI vendors in the generated UI.

${languageInstruction(language)}
For visible UI text in the HTML: use the user's language (or preferred language above).

Reminder: you can be wrong; you are not a doctor or lawyer.`;
}

function buildSystemFullstack(language?: string | null) {
  return `You are Okapi (MMC SARL AI platform) fullstack engine.
When asked, generate a compact web app WITH backend scaffolding for Okapi cloud database (Postgres-compatible).

OUTPUT FORMAT — use these exact markers (no markdown fences around the whole reply):

===OKAPI_HTML===
<!DOCTYPE html>...complete single-file app...
===OKAPI_SQL===
-- Okapi cloud DB / Postgres schema: tables, indexes, row-level security policies
===OKAPI_API===
// Next.js App Router API route stubs (TypeScript)
// Use env placeholders NEXT_PUBLIC_OKAPI_DB_URL and NEXT_PUBLIC_OKAPI_DB_ANON_KEY
// (compatible with standard Postgres JS clients)
// Never invent real API keys or secrets
// Never mention third-party vendor brand names (database hosts, AI vendors) in README or UI
===OKAPI_README===
Short setup steps in the user's language (create DB project, run SQL, set env, run app). Call the database "base Okapi" — never name external vendors.
===OKAPI_END===

Rules:
1. HTML is mobile-first, Tailwind CDN, RDC-friendly (WhatsApp / Mobile Money when useful).
2. SQL: enable RLS, sensible policies (anon read public data; authenticated write when auth is needed).
3. API stubs: clear, copy-pasteable, one or two route files in comments if multiple.
4. Do only what was requested — no useless bonus features.
5. Never mention third-party AI or database vendor brand names in any user-facing text.
6. On edit: return ALL sections updated (HTML + SQL + API + README).

${languageInstruction(language)}
UI text in HTML + README: user's language (or preferred language above).

Reminder: you can be wrong; you are not a doctor or lawyer.`;
}

type Body = {
  message?: string;
  sector?: string;
  language?: string;
  currentHtml?: string;
  currentSql?: string;
  currentApi?: string;
  stream?: boolean;
  /** "html" | "fullstack" | "auto" (default) */
  mode?: string;
};

function buildPrompt(
  sector: string,
  message: string,
  mode: GenerateMode,
  currentHtml?: string,
  currentSql?: string,
  currentApi?: string,
) {
  if (mode === "fullstack") {
    if (currentHtml) {
      return `Sector: ${sector}
Mode: fullstack (HTML + SQL base Okapi + API stubs)
Modify all relevant artifacts:
${message}

Current HTML:
${currentHtml.slice(0, 22000)}

${currentSql ? `Current SQL:\n${currentSql.slice(0, 8000)}\n` : ""}
${currentApi ? `Current API:\n${currentApi.slice(0, 8000)}\n` : ""}`;
    }
    return `Sector: ${sector}
Mode: fullstack (HTML + SQL base Okapi + API stubs)
Generate a compact fullstack app:
${message}`;
  }

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
  maxTokens = 4096,
) {
  const run = async (withThinking: boolean) => {
    const stream = await ai.models.generateContentStream({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
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
  maxTokens = 8192,
) {
  const provider = preferProvider();
  if (!provider) {
    throw new Error(missingLlmMessage());
  }

  if (provider === "openai") {
    onStatus?.("Okapi génère…");
    const text = await openAiComplete({
      system,
      user: prompt,
      maxTokens,
    });
    onChunk?.(text);
    return text;
  }

  if (provider === "openrouter") {
    onStatus?.("Okapi génère…");
    const text = await openRouterComplete({
      system,
      user: prompt,
      maxTokens,
    });
    onChunk?.(text);
    return text;
  }

  if (provider === "claude") {
    throw new Error("provider_unavailable");
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(missingLlmMessage());
  }

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
  const ai = new GoogleGenAI({ apiKey: key });

  try {
    return await generateOnce(ai, model, prompt, system, onChunk, maxTokens);
  } catch (err) {
    if (isRetryableLlm(err)) {
      await new Promise((r) => setTimeout(r, 800));
      return await generateOnce(ai, model, prompt, system, onChunk, maxTokens);
    }
    if (isLocationBlocked(err) && openAiConfigured()) {
      onStatus?.("Okapi reconnecte le service…");
      const text = await openAiComplete({ system, user: prompt, maxTokens });
      onChunk?.(text);
      return text;
    }
    if (isLocationBlocked(err) && openRouterConfigured()) {
      onStatus?.("Okapi reconnecte le service…");
      const text = await openRouterComplete({
        system,
        user: prompt,
        maxTokens,
      });
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
  const mode = resolveGenerateMode(message, body?.mode);
  const system =
    mode === "fullstack"
      ? buildSystemFullstack(language)
      : buildSystemHtml(language);
  const currentHtml = body?.currentHtml?.trim();
  const currentSql = body?.currentSql?.trim();
  const currentApi = body?.currentApi?.trim();
  const wantStream = body?.stream !== false;
  const prompt = buildPrompt(
    sector,
    message,
    mode,
    currentHtml,
    currentSql,
    currentApi,
  );
  const maxTokens = mode === "fullstack" ? 12000 : 8192;

  const finish = (raw: string) => {
    if (!raw) {
      return {
        error: "Le modèle n’a renvoyé aucun contenu.",
        status: 502 as const,
      };
    }
    const artifacts = parseOkapiArtifacts(raw);
    if (!artifacts.html.toLowerCase().includes("<html")) {
      return {
        error: "Réponse invalide (pas un document HTML).",
        preview: raw.slice(0, 400),
        status: 502 as const,
      };
    }
    const title = titleFromHtml(artifacts.html, `Projet ${sector}`);
    const fullstackReady = Boolean(artifacts.sql || artifacts.api);
    const summary = currentHtml
      ? fullstackReady
        ? `Preview + backend mis à jour : ${title}`
        : `Preview mise à jour : ${title}`
      : fullstackReady
        ? `Preview fullstack prête : ${title}. Exporte le schéma SQL et les routes API.`
        : `Preview prête : ${title}. Dis-moi quoi changer.`;

    return {
      ok: true as const,
      mode,
      html: artifacts.html,
      sql: artifacts.sql,
      api: artifacts.api,
      readme: artifacts.readme,
      title,
      summary,
      status: 200 as const,
    };
  };

  if (!wantStream) {
    try {
      const raw = await generateWithFallback(
        prompt,
        system,
        undefined,
        undefined,
        maxTokens,
      );
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
        send({
          type: "status",
          message:
            mode === "fullstack"
              ? "Okapi génère le fullstack (UI + base)…"
              : "Okapi génère…",
          mode,
        });
        const raw = await generateWithFallback(
          prompt,
          system,
          (text) => send({ type: "delta", text }),
          (msg) => send({ type: "status", message: msg, mode }),
          maxTokens,
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
            mode: out.mode,
            html: out.html,
            sql: out.sql,
            api: out.api,
            readme: out.readme,
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
