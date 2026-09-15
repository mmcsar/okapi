import { friendlyLlmError } from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import { openAiComplete } from "@/lib/openai";
import { openRouterComplete } from "@/lib/openrouter";
import { resolveEngine } from "@/lib/okapi-engine";
import { wantsLargeProject } from "@/lib/fullstack";
import { assertBodySize } from "@/lib/security";
import {
  STUDIO_FILE_IDS,
  type StudioFileId,
} from "@/lib/studio-files";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED = STUDIO_FILE_IDS;

type Body = {
  instruction?: string;
  engine?: string;
  title?: string;
};

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json|[\w.+-]*)?\s*\n?([\s\S]*?)\n?```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripFences(raw);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<
          string,
          unknown
        >;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function complete(opts: {
  system: string;
  user: string;
  engine: ReturnType<typeof resolveEngine>;
  maxTokens: number;
}) {
  const provider = pickLlmProvider();
  if (!provider) throw new Error(missingLlmMessage());

  if (provider === "openai") {
    return openAiComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      engine: opts.engine,
    });
  }
  if (provider === "openrouter") {
    return openRouterComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      engine: opts.engine,
    });
  }
  throw new Error(missingLlmMessage());
}

function buildSystem(large: boolean, engine: string) {
  const scale = large
    ? `SCALE — GRAND PROJET (engine=${engine}):
- Ship a real product skeleton for RDC businesses (CRM, boutique, école, clinique, flotte…).
- app.html: multi-screen SPA (nav + at least 4–6 views/modules), Tailwind CDN, mobile-first.
- App.tsx + app/page.tsx: mirror the same product structure (usable stubs, not placeholders).
- schema.sql: several related tables, indexes, RLS policies, seed comments.
- api.ts: several route stubs (CRUD + auth/session where relevant).
- README.md: architecture modules + how to run in Okapi Studio.
- Optional App.native.tsx / main.py / main.dart only if they clearly help.
- Think end-to-end: list → detail → form → empty states → WhatsApp / Mobile Money hooks when useful.`
    : `SCALE — projet standard:
- Complete, lean product: solid HTML + React + SQL + API + README.
- At least 2–3 screens in HTML. Code must run in Preview.`;

  return `You are Okapi Studio (MMC SARL) — senior product engineer and coding coach for builders in DR Congo.
You plan like a tech lead, then deliver a complete multi-file project the user can Accept in Studio.

Return ONLY valid JSON (no markdown outside JSON):
{
  "title": "Nom du projet",
  "note": "Résumé court en français : modules livrés + comment tester",
  "files": {
    "app.html": "<!DOCTYPE html>...",
    "App.tsx": "...",
    "app/page.tsx": "...",
    "schema.sql": "...",
    "api.ts": "...",
    "README.md": "..."
  }
}

Mandatory files for a complete app: app.html, App.tsx, app/page.tsx, schema.sql, api.ts, README.md.
Optional: App.native.tsx, main.py, main.dart when relevant.

Rules:
1. ${scale}
2. app.html must be a full document (DOCTYPE … </html>), Tailwind CDN, RDC-friendly UX.
3. Photos: https://image.pollinations.ai/prompt/URL_ENCODED_ENGLISH_DESCRIPTION?width=1200&height=800&nologo=true
4. Never invent real API keys. Use NEXT_PUBLIC_OKAPI_DB_URL / NEXT_PUBLIC_OKAPI_DB_ANON_KEY placeholders.
5. Never mention third-party AI or database vendor brand names in UI or README — say « base Okapi » / Okapi / MMC SARL.
6. UI copy in the user's language (French if they write French).
7. Every file must be substantial and coherent with the others — no empty stubs, no lorem-only pages.
8. Prefer working demo logic (localStorage / in-memory) in HTML when it helps the Preview feel real.`;
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 200_000);
  if (tooBig) return tooBig;

  if (!pickLlmProvider()) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "generate");
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as Body | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) {
    return Response.json(
      { error: "Décris le projet à créer." },
      { status: 400 },
    );
  }
  if (instruction.length > 8000) {
    return Response.json({ error: "Instruction trop longue." }, { status: 400 });
  }

  const engine = resolveEngine(body?.engine);
  const large = wantsLargeProject(instruction) || engine === "pro";
  const hintTitle = body?.title?.trim();
  const maxTokens = large ? 16000 : 12000;

  const user = `Build a COMPLETE Okapi Studio project from this brief.
Aim for coach-level quality: coherent modules, real UI, SQL + API aligned with the product.

BRIEF:
-----
${instruction}
-----
${hintTitle ? `Suggested title: ${hintTitle}` : ""}
Mode: ${large ? "GRAND PROJET" : "projet standard"} · engine=${engine}

Return JSON only with title, note, and files map. Include all mandatory files.`;

  try {
    const raw = await complete({
      system: buildSystem(large, engine),
      user,
      engine,
      maxTokens,
    });
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
      return Response.json(
        { error: "Réponse projet invalide. Réessaie." },
        { status: 502 },
      );
    }

    const filesRaw = parsed.files;
    if (!filesRaw || typeof filesRaw !== "object") {
      return Response.json(
        { error: "Aucun fichier dans la réponse. Réessaie." },
        { status: 502 },
      );
    }

    const files: { fileId: StudioFileId; content: string }[] = [];
    for (const id of ALLOWED) {
      const value = (filesRaw as Record<string, unknown>)[id];
      if (typeof value === "string" && value.trim()) {
        files.push({ fileId: id, content: value.trim() });
      }
    }

    if (files.length === 0) {
      return Response.json(
        { error: "Projet vide. Reformule ta demande." },
        { status: 502 },
      );
    }

    const title =
      (typeof parsed.title === "string" && parsed.title.trim()) ||
      hintTitle ||
      "Projet Okapi";
    const note =
      (typeof parsed.note === "string" && parsed.note.trim()) ||
      `Projet « ${title} » · ${files.length} fichiers prêts à Accepter.`;

    return Response.json({
      ok: true,
      title,
      note,
      large,
      files,
    });
  } catch (err) {
    return Response.json({ error: friendlyLlmError(err) }, { status: 502 });
  }
}
