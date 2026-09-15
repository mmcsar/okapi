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
  assessStudioProjectFiles,
  buildStudioProjectRepairPrompt,
  formatStudioHistory,
  formatStudioWorkspaceContext,
  sanitizeStudioHistory,
  sanitizeStudioWorkspace,
  shouldRepairStudioProject,
} from "@/lib/studio-context";
import {
  agentSystemBlock,
  resolveOkapiAgent,
} from "@/lib/studio-agents";
import {
  STUDIO_FILE_IDS,
  type StudioFileId,
} from "@/lib/studio-files";
import {
  encodeStudioStreamEvent,
  type StudioStreamEvent,
} from "@/lib/studio-stream";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED = STUDIO_FILE_IDS;

type Body = {
  instruction?: string;
  engine?: string;
  title?: string;
  agentId?: string;
  sector?: string;
  workspace?: unknown;
  history?: unknown;
  stream?: boolean;
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

function buildSystem(large: boolean, engine: string, agentBlock: string) {
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
${agentBlock}
If WORKSPACE CONTEXT already has files, extend / replace coherently — do not ignore existing product names or data shapes unless asked.
Use AGENT HISTORY for follow-ups.

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
4. Never invent real API keys. Prefer window.Okapi.list/create for live Preview data (Okapi cloud). Optional stubs in api.ts may mirror the same collections.
5. Never mention third-party AI or database vendor brand names in UI or README — say « base Okapi » / Okapi / MMC SARL.
6. UI copy in the user's language (French if they write French).
7. Every file must be substantial and coherent with the others — no empty stubs, no lorem-only pages.
8. Prefer REAL Okapi data via window.Okapi (not localStorage demos) when building interactive lists/forms:
   - await Okapi.list('products'|'orders'|'patients'|…)
   - await Okapi.create(collection, data)
   - await Okapi.update(id, data) / Okapi.remove(id)
   The Preview injects window.Okapi automatically when the project is saved & user is logged in.
9. Always finish JSON completely — never truncate mid-string.
10. Follow the AGENT MÉTIER product rules above strictly (screens, SQL, API, RDC payments).
11. In README explain: données réelles = API Okapi / base Okapi (pas localStorage).`;
}

function parseProjectFiles(
  parsed: Record<string, unknown>,
): { fileId: StudioFileId; content: string }[] {
  const filesRaw = parsed.files;
  if (!filesRaw || typeof filesRaw !== "object") return [];

  const files: { fileId: StudioFileId; content: string }[] = [];
  for (const id of ALLOWED) {
    const value = (filesRaw as Record<string, unknown>)[id];
    if (typeof value === "string" && value.trim()) {
      files.push({ fileId: id, content: value.trim() });
    }
  }
  return files;
}

type ProjectResult = {
  title: string;
  note: string;
  large: boolean;
  repaired: boolean;
  qualityIssues: string[];
  files: { fileId: StudioFileId; content: string }[];
};

async function runStudioProject(opts: {
  instruction: string;
  engine: ReturnType<typeof resolveEngine>;
  large: boolean;
  hintTitle?: string;
  agentBlock: string;
  agentLabel: string;
  workspace: ReturnType<typeof sanitizeStudioWorkspace>;
  history: ReturnType<typeof sanitizeStudioHistory>;
  onStatus?: (event: Extract<StudioStreamEvent, { type: "status" }>) => void;
}): Promise<ProjectResult> {
  const {
    instruction,
    engine,
    large,
    hintTitle,
    agentBlock,
    agentLabel,
    workspace,
    history,
    onStatus,
  } = opts;
  const maxTokens = large ? 16000 : 12000;
  const system = buildSystem(large, engine, agentBlock);
  const total = 4;

  const user = `Build a COMPLETE Okapi Studio project from this brief.
Aim for coach-level quality: coherent modules, real UI, SQL + API aligned with the product.
Active métier agent: ${agentLabel}

BRIEF:
-----
${instruction}
-----
${hintTitle ? `Suggested title: ${hintTitle}` : ""}
Mode: ${large ? "GRAND PROJET" : "projet standard"} · engine=${engine}

AGENT HISTORY (recent):
${formatStudioHistory(history)}

EXISTING WORKSPACE (extend coherently if present):
${formatStudioWorkspaceContext(workspace)}

Return JSON only with title, note, and files map. Include all mandatory files.`;

  onStatus?.({
    type: "status",
    message: `Agent ${agentLabel} · ${
      large ? "grand projet…" : "planifie le projet…"
    }`,
    step: 1,
    total,
    large,
    engine,
  });

  onStatus?.({
    type: "status",
    message: "Génération des fichiers (HTML, React, SQL, API)…",
    step: 2,
    total,
    large,
    engine,
  });

  let raw = await complete({
    system,
    user,
    engine,
    maxTokens,
  });
  let repaired = false;

  onStatus?.({
    type: "status",
    message: "Vérification qualité du scaffold…",
    step: 3,
    total,
    large,
    engine,
  });

  let parsed = extractJsonObject(raw);
  let files = parsed ? parseProjectFiles(parsed) : [];
  let issues = assessStudioProjectFiles(files, { large });

  if (
    (!parsed || files.length === 0 || shouldRepairStudioProject(issues)) &&
    raw.trim()
  ) {
    if (!parsed || files.length === 0) {
      issues = [
        {
          code: "invalid_json",
          detail:
            "Previous response was not valid project JSON or had no files.",
        },
        ...issues,
      ];
    }

    onStatus?.({
      type: "status",
      message: "Auto-correction du projet en cours…",
      step: 3,
      total,
      large,
      engine,
      repairing: true,
    });

    raw = await complete({
      system,
      user: buildStudioProjectRepairPrompt({
        instruction,
        issues,
        previousRaw: raw,
        titleHint: hintTitle,
      }),
      engine,
      maxTokens,
    });
    repaired = true;
    parsed = extractJsonObject(raw);
    files = parsed ? parseProjectFiles(parsed) : [];
    issues = assessStudioProjectFiles(files, { large });
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Réponse projet invalide. Réessaie.");
  }

  if (files.length === 0) {
    throw new Error("Projet vide. Reformule ta demande.");
  }

  const title =
    (typeof parsed.title === "string" && parsed.title.trim()) ||
    hintTitle ||
    "Projet Okapi";
  const note =
    (typeof parsed.note === "string" && parsed.note.trim()) ||
    `Projet « ${title} » · ${files.length} fichiers prêts.`;

  onStatus?.({
    type: "status",
    message: `Livraison · ${files.length} fichiers…`,
    step: 4,
    total,
    large,
    engine,
  });

  return {
    title,
    note: repaired
      ? `${note} (Okapi a auto-corrigé la génération.)`
      : note,
    large,
    repaired,
    qualityIssues: issues.map((i) => i.code),
    files,
  };
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 1_500_000);
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
  const workspace = sanitizeStudioWorkspace(body?.workspace);
  const history = sanitizeStudioHistory(body?.history);
  const wantStream = body?.stream !== false;
  const agent = resolveOkapiAgent({
    agentId: body?.agentId,
    sector: body?.sector,
    instruction,
  });
  const agentBlock = agentSystemBlock(agent);

  if (!wantStream) {
    try {
      const result = await runStudioProject({
        instruction,
        engine,
        large,
        hintTitle,
        agentBlock,
        agentLabel: agent.label,
        workspace,
        history,
      });
      return Response.json({
        ok: true,
        ...result,
        agentId: agent.id,
        agentLabel: agent.label,
        usedContext: {
          siblings: workspace.filter((f) => f.content?.trim()).length,
          historyTurns: history.length,
        },
      });
    } catch (err) {
      return Response.json({ error: friendlyLlmError(err) }, { status: 502 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StudioStreamEvent) => {
        controller.enqueue(encoder.encode(encodeStudioStreamEvent(event)));
      };
      try {
        const result = await runStudioProject({
          instruction,
          engine,
          large,
          hintTitle,
          agentBlock,
          agentLabel: agent.label,
          workspace,
          history,
          onStatus: (s) => send(s),
        });
        send({
          type: "done",
          title: result.title,
          note: result.note,
          large: result.large,
          repaired: result.repaired,
          files: result.files,
          qualityIssues: result.qualityIssues,
        });
      } catch (err) {
        send({ type: "error", error: friendlyLlmError(err) });
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
