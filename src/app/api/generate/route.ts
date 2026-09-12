import { GoogleGenAI } from "@google/genai";
import { languageInstruction } from "@/lib/i18n";
import {
  friendlyLlmError,
  isLocationBlocked,
  isRetryableLlm,
} from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
  releaseGenerateSlot,
} from "@/lib/llm-quota";
import { openAiComplete, openAiConfigured } from "@/lib/openai";
import { openRouterComplete, openRouterConfigured } from "@/lib/openrouter";
import {
  ensureHtmlDocument,
  parseOkapiArtifacts,
  resolveGenerateMode,
  titleFromHtml,
  wantsLargeProject,
  type GenerateMode,
} from "@/lib/fullstack";
import { resolveEngine, type OkapiEngine } from "@/lib/okapi-engine";
import { assertBodySize } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildSystemHtml(
  language?: string | null,
  engine: OkapiEngine = "flash",
  large = false,
) {
  const scale =
    large || engine === "pro"
      ? `SCALE: Build a substantial product UI (multi-section / multi-view in one HTML file).
- Include navigation between views (tabs or hash/simple JS router).
- Cover the main user flows asked (list, detail, forms, empty states).
- Still ONE HTML file. Prefer depth over decorative fluff.`
      : `SCALE: Compact but complete single-page app. Only what was asked.`;

  return `You are Okapi (MMC SARL AI platform) HTML engine — engine=${engine}.
Generate ONE complete web app as a single HTML file ONLY when asked.

Rules:
1. ONLY the HTML document (start with <!DOCTYPE html> and ALWAYS end with </html>). No markdown.
2. Do only what was requested — no useless bonus sections. Prefer a complete short page over a truncated long one.
3. Mobile-first. RDC context (WhatsApp / Mobile Money) when asked or clearly useful.
4. Tailwind CDN: https://cdn.tailwindcss.com + inline JS if needed.
5. Header with project name. Clean design, not generic purple.
6. For photos/hero/product images use REAL URLs (max 4 images total):
   https://image.pollinations.ai/prompt/URL_ENCODED_ENGLISH_DESCRIPTION?width=1200&height=800&nologo=true
   Never use empty src or fake local image paths.
7. On edit: return the FULL updated HTML, always closed with </html>.
8. Never mention third-party AI vendors in the generated UI.
9. Keep Flash pages compact enough to finish: hero + 1–2 sections + footer is enough unless asked for more.
${scale}

${languageInstruction(language)}
For visible UI text in the HTML: use the user's language (or preferred language above).

Reminder: you can be wrong; you are not a doctor or lawyer.`;
}

function buildSystemFullstack(
  language?: string | null,
  engine: OkapiEngine = "flash",
  large = false,
) {
  const scale =
    large || engine === "pro"
      ? `SCALE — GRAND PROJET (Okapi ${engine}):
- Rich HTML with several screens/modules (nav + at least 3–6 views).
- SQL: multiple related tables, indexes, RLS, seed comments if useful.
- API: several route stubs covering main CRUD / auth flows.
- README: clear architecture overview (modules + how to run).
- Think like a real product for RDC businesses (CRM, boutique, école, clinique, etc.) when relevant.`
      : `SCALE — projet standard:
- Solid HTML + essential SQL + a couple of API routes.
- Keep it complete but lean.`;

  return `You are Okapi (MMC SARL AI platform) fullstack engine — engine=${engine}.
When asked, generate a web app WITH backend scaffolding for Okapi cloud database (Postgres-compatible).
Both Okapi Flash and Okapi Pro can create large projects; Pro goes deeper on architecture and edge cases.

OUTPUT FORMAT — use these exact markers (no markdown fences around the whole reply):

===OKAPI_HTML===
<!DOCTYPE html>...complete single-file app...
===OKAPI_SQL===
-- Okapi cloud DB / Postgres schema: tables, indexes, row-level security policies
===OKAPI_API===
// Next.js App Router API route stubs (TypeScript)
// Use env placeholders NEXT_PUBLIC_OKAPI_DB_URL and NEXT_PUBLIC_OKAPI_DB_ANON_KEY
// Never invent real API keys or secrets
// Never mention third-party vendor brand names in README or UI
===OKAPI_README===
Setup steps in the user's language. Call the database "base Okapi" — never name external vendors.
===OKAPI_END===

Rules:
1. HTML is mobile-first, Tailwind CDN, RDC-friendly (WhatsApp / Mobile Money when useful).
2. For photos in HTML use:
   https://image.pollinations.ai/prompt/URL_ENCODED_ENGLISH_DESCRIPTION?width=1200&height=800&nologo=true
3. SQL: enable RLS, sensible policies.
4. API stubs: clear, copy-pasteable.
5. Do only what was requested — no useless marketing filler.
6. Never mention third-party AI or database vendor brand names in user-facing text.
7. On edit: return ALL sections updated.
${scale}

${languageInstruction(language)}
UI text in HTML + README: user's language (or preferred language above).

Reminder: you can be wrong; you are not a doctor or lawyer.`;
}

function buildSystemDebug(language?: string | null, fullstack = false) {
  const format = fullstack
    ? `OUTPUT FORMAT — exact markers:

===OKAPI_HTML===
<!DOCTYPE html>...FULL fixed HTML...
===OKAPI_SQL===
-- fixed SQL if needed (else keep/improve current)
===OKAPI_API===
// fixed API stubs if needed
===OKAPI_README===
2-4 lines: what was broken + what you fixed (user language). No vendor brand names.
===OKAPI_END===`
    : `Return ONLY the FULL fixed HTML document (start with <!DOCTYPE html>). No markdown.`;

  return `You are Okapi Debugger (MMC SARL AI platform).
Your job: find and FIX bugs in the user's project artifacts.

Rules:
1. Read the error / bug description carefully.
2. Fix the root cause — do not rewrite unrelated features.
3. Return complete updated files (not a diff).
4. Prefer minimal safe fixes.
5. Never mention third-party AI or database vendor brand names.
6. If the bug is unclear, still apply the most likely safe fix based on the code + message.

${format}

${languageInstruction(language)}

Reminder: you can be wrong; invite the user to retest the Preview.`;
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
  /** Debug / bugfix pass */
  debug?: boolean;
  /** "flash" | "pro" */
  engine?: string;
};

function buildPrompt(
  sector: string,
  message: string,
  mode: GenerateMode,
  debug: boolean,
  currentHtml?: string,
  currentSql?: string,
  currentApi?: string,
  large = false,
  engine: OkapiEngine = "flash",
) {
  const scaleLabel = large
    ? `GRAND PROJET · engine=${engine}`
    : `projet standard · engine=${engine}`;

  if (debug) {
    return `Sector: ${sector}
Mode: DEBUG — fix the bug, return full corrected artifacts (${mode}).

Bug / error report from user:
${message}

Current HTML:
${(currentHtml || "").slice(0, 22000) || "(empty)"}

${currentSql ? `Current SQL:\n${currentSql.slice(0, 8000)}\n` : ""}
${currentApi ? `Current API:\n${currentApi.slice(0, 8000)}\n` : ""}`;
  }

  if (mode === "fullstack") {
    if (currentHtml) {
      return `Sector: ${sector}
Mode: fullstack (${scaleLabel})
Modify all relevant artifacts:
${message}

Current HTML:
${currentHtml.slice(0, 22000)}

${currentSql ? `Current SQL:\n${currentSql.slice(0, 8000)}\n` : ""}
${currentApi ? `Current API:\n${currentApi.slice(0, 8000)}\n` : ""}`;
    }
    return `Sector: ${sector}
Mode: fullstack (${scaleLabel})
Generate a ${large ? "large multi-module" : "complete"} fullstack app:
${message}`;
  }

  if (currentHtml) {
    return `Sector: ${sector}
Modify (${scaleLabel}, full HTML):
${message}

Current HTML:
${currentHtml.slice(0, 28000)}`;
  }
  return `Sector: ${sector}
Generate a ${large ? "substantial multi-view" : "compact"} app (${scaleLabel}):
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
  engine: OkapiEngine = "flash",
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
      engine,
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
      engine,
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
      const text = await openAiComplete({
        system,
        user: prompt,
        maxTokens,
        engine,
      });
      onChunk?.(text);
      return text;
    }
    if (isLocationBlocked(err) && openRouterConfigured()) {
      onStatus?.("Okapi reconnecte le service…");
      const text = await openRouterComplete({
        system,
        user: prompt,
        maxTokens,
        engine,
      });
      onChunk?.(text);
      return text;
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 2_500_000);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as Body | null;
  const message = body?.message?.trim();
  if (!message) {
    return Response.json({ error: "Message vide." }, { status: 400 });
  }
  if (message.length > 20_000) {
    return Response.json({ error: "Message trop long." }, { status: 400 });
  }

  if (!pickLlmProvider()) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const quota = checkAndConsumeQuota(
    quotaKeyFromRequest(request),
    "generate",
  );
  if (!quota.ok) return quotaExceededResponse(quota);

  const sector = body?.sector?.trim() || "Site web";
  const language = body?.language?.trim() || "auto";
  const debug = Boolean(body?.debug);
  const hasBackendArtifacts = Boolean(
    body?.currentSql?.trim() || body?.currentApi?.trim(),
  );
  let mode = resolveGenerateMode(message, body?.mode);
  if (debug) {
    mode =
      body?.mode === "fullstack" || hasBackendArtifacts
        ? "fullstack"
        : body?.mode === "html"
          ? "html"
          : hasBackendArtifacts
            ? "fullstack"
            : "html";
  }

  const engine = resolveEngine(body?.engine);
  const large = wantsLargeProject(message);
  // Grands projets → fullstack même sans mot "supabase"
  if (!debug && large && mode === "html" && body?.mode !== "html") {
    mode = "fullstack";
  }

  const currentHtml = body?.currentHtml?.trim();
  const currentSql = body?.currentSql?.trim();
  const currentApi = body?.currentApi?.trim();
  const wantStream = body?.stream !== false;

  const system = debug
    ? buildSystemDebug(language, mode === "fullstack")
    : mode === "fullstack"
      ? buildSystemFullstack(language, engine, large)
      : buildSystemHtml(language, engine, large);

  const prompt = buildPrompt(
    sector,
    message,
    mode,
    debug,
    currentHtml,
    currentSql,
    currentApi,
    large,
    engine,
  );
  const maxTokens =
    large || mode === "fullstack" || debug || engine === "pro" ? 9000 : 5000;

  const finish = (raw: string) => {
    if (!raw) {
      return {
        error: "Le modèle n’a renvoyé aucun contenu.",
        status: 502 as const,
      };
    }
    const artifacts = parseOkapiArtifacts(raw);
    artifacts.html = ensureHtmlDocument(artifacts.html);
    if (!artifacts.html.toLowerCase().includes("<html")) {
      return {
        error: "Réponse invalide (pas un document HTML).",
        preview: raw.slice(0, 400),
        status: 502 as const,
      };
    }
    const title = titleFromHtml(artifacts.html, `Projet ${sector}`);
    const fullstackReady = Boolean(artifacts.sql || artifacts.api);
    const summary = debug
      ? artifacts.readme?.trim() ||
        `Bug corrigé : ${title}. Reteste la Preview.`
      : large
        ? fullstackReady
          ? `Grand projet prêt : ${title} (UI + base + API). Explore Preview / Code / SQL.`
          : `Grand projet UI prêt : ${title}. Dis-moi quoi enrichir.`
        : currentHtml
          ? fullstackReady
            ? `Preview + backend mis à jour : ${title}`
            : `Preview mise à jour : ${title}`
          : fullstackReady
            ? `Preview fullstack prête : ${title}. Exporte le schéma SQL et les routes API.`
            : `Preview prête : ${title}. Dis-moi quoi changer.`;

    return {
      ok: true as const,
      mode,
      debug,
      large,
      engine,
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
        engine,
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
    } finally {
      releaseGenerateSlot();
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
          message: debug
            ? "Okapi debug… analyse et correction…"
            : large
              ? engine === "pro"
                ? "Okapi Pro construit un grand projet…"
                : "Okapi Flash construit un grand projet…"
              : mode === "fullstack"
                ? "Okapi génère le fullstack (UI + base)…"
                : "Okapi génère…",
          mode,
          debug,
          large,
          engine,
        });
        const raw = await generateWithFallback(
          prompt,
          system,
          (text) => send({ type: "delta", text }),
          (msg) => send({ type: "status", message: msg, mode }),
          maxTokens,
          engine,
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
            debug: out.debug,
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
        releaseGenerateSlot();
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
