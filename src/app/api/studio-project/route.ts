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
import { assertBodySize } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

type StudioFileId =
  | "app.html"
  | "App.tsx"
  | "App.native.tsx"
  | "app/page.tsx"
  | "schema.sql"
  | "api.ts"
  | "main.py"
  | "main.dart"
  | "README.md";

const ALLOWED: StudioFileId[] = [
  "app.html",
  "App.tsx",
  "App.native.tsx",
  "app/page.tsx",
  "schema.sql",
  "api.ts",
  "main.py",
  "main.dart",
  "README.md",
];

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
}) {
  const provider = pickLlmProvider();
  if (!provider) throw new Error(missingLlmMessage());

  if (provider === "openai") {
    return openAiComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 12000,
      engine: opts.engine,
    });
  }
  if (provider === "openrouter") {
    return openRouterComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 12000,
      engine: opts.engine,
    });
  }
  throw new Error(missingLlmMessage());
}

const SYSTEM = `You are Okapi Studio (MMC SARL) — full project scaffolder, like a senior Cursor agent.

Return ONLY valid JSON (no markdown outside JSON) with this shape:
{
  "title": "Project name",
  "note": "Short French summary of what was built",
  "files": {
    "app.html": "<!DOCTYPE html>...",
    "App.tsx": "...",
    "app/page.tsx": "...",
    "schema.sql": "...",
    "api.ts": "...",
    "README.md": "..."
  }
}

Rules:
- Always include at least: app.html, App.tsx, schema.sql, api.ts, README.md when building a complete app.
- Optional: App.native.tsx, app/page.tsx, main.py, main.dart if useful.
- app.html must be a complete document (DOCTYPE + </html>), Tailwind CDN, mobile-first, RDC-friendly (WhatsApp / Mobile Money) when relevant.
- No third-party AI vendor names in UI strings — say Okapi / MMC SARL.
- Prefer French UI labels when the user writes in French.
- Code must be complete enough to open in Okapi Studio and Preview.
- Keep each file focused; avoid useless fluff.`;

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
  const hintTitle = body?.title?.trim();

  const user = `Build a COMPLETE Okapi project from this brief:
-----
${instruction}
-----
${hintTitle ? `Suggested title: ${hintTitle}` : ""}

Return JSON only with title, note, and files map.`;

  try {
    const raw = await complete({ system: SYSTEM, user, engine });
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
      files,
    });
  } catch (err) {
    return Response.json({ error: friendlyLlmError(err) }, { status: 502 });
  }
}
