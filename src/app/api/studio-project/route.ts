import { friendlyLlmError } from "@/lib/llm-errors";
import { claudeComplete } from "@/lib/anthropic";
import { missingLlmMessage, pickWithClaude } from "@/lib/llm-provider";
import {
  resolveEngineForPlan,
  resolveLlmAccess,
} from "@/lib/llm-access";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
  releaseGenerateSlot,
} from "@/lib/llm-quota";
import type { OkapiEngine } from "@/lib/okapi-engine";
import { openAiComplete } from "@/lib/openai";
import { openRouterComplete } from "@/lib/openrouter";
import { ensureHtmlDocument, wantsLargeProject } from "@/lib/fullstack";
import { assertBodySize } from "@/lib/security";
import {
  OKAPI_APP_CONTRACT,
  OKAPI_MOBILE_MONEY_UX,
  OKAPI_PRODUCT_DESIGN,
  OKAPI_VITRINE_DESIGN,
  OKAPI_WEBSITE_CONTRACT,
  wantsWebsiteBrief,
} from "@/lib/generate-quality";
import {
  assessStudioProjectFiles,
  buildStudioProjectRepairPrompt,
  formatStudioHistory,
  formatStudioWorkspaceContext,
  sanitizeStudioHistory,
  sanitizeStudioWorkspace,
  mustRepairStudioProject,
  shouldRepairStudioProject,
} from "@/lib/studio-context";
import {
  agentSystemBlock,
  resolveOkapiAgent,
} from "@/lib/studio-agents";
import {
  intelligenceSystemBlock,
  loadUserIntelligenceContext,
} from "@/lib/okapi-intelligence";
import { getUserFromAuthHeader } from "@/lib/supabase";
import {
  STUDIO_FILE_IDS,
  type StudioFileId,
} from "@/lib/studio-files";
import {
  encodeStudioStreamEvent,
  type StudioStreamEvent,
} from "@/lib/studio-stream";

export const runtime = "nodejs";
/** Platforms often need a long first pass; avoid a second repair that hits the wall. */
export const maxDuration = 300;

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

/** JSON coupé (max_tokens / réseau) — braces non fermées ou HTML tronqué. */
function looksTruncatedStudioOutput(raw: string): boolean {
  const t = stripFences(raw);
  if (t.length < 40) return true;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
  }
  if (inStr || depth > 0) return true;
  if (/app\.html/i.test(t) && !/<\/html>/i.test(t)) return true;
  return false;
}

function buildStudioContinuePrompt(opts: {
  instruction: string;
  previousRaw: string;
  hintTitle?: string;
}) {
  const tail = opts.previousRaw.slice(-1600);
  return `CONTINUE MODE — the previous Okapi Studio JSON was CUT OFF before finishing.
Return ONE COMPLETE valid JSON object now (title, note, files). No markdown fences.
CRITICAL ORDER:
1) Finish files.app.html as a FULL <!DOCTYPE html>…</html> document (Preview depends on it).
2) Then compact package.json, schema.sql, api.ts, App.tsx, app/page.tsx, README.md — short but coherent.
Never leave open JSON strings. Prefer a solid finished Preview over incomplete extra files.
Original brief:
${opts.instruction}
${opts.hintTitle ? `Suggested title: ${opts.hintTitle}` : ""}

Incomplete output so far (rewrite into one complete JSON — keep good parts of app.html if usable):
-----
${opts.previousRaw.slice(0, 28000)}
-----
Last characters were:
-----
${tail}
-----`;
}

async function complete(opts: {
  system: string;
  user: string;
  engine: OkapiEngine;
  maxTokens: number;
  onChunk?: (text: string) => void;
}) {
  const provider = pickWithClaude();
  if (!provider) throw new Error(missingLlmMessage());

  if (provider === "claude") {
    return claudeComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      onChunk: opts.onChunk,
    });
  }
  if (provider === "openai") {
    return openAiComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      engine: opts.engine,
      onChunk: opts.onChunk,
    });
  }
  if (provider === "openrouter") {
    return openRouterComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: opts.maxTokens,
      engine: opts.engine,
      reasoningEffort: opts.engine === "pro" ? "xhigh" : "high",
      onChunk: opts.onChunk,
    });
  }
  throw new Error(missingLlmMessage());
}

/** Batch token deltas so NDJSON stays light (~12 flush/s). */
function makeDeltaBatcher(onDelta: (text: string) => void) {
  let buf = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!buf) return;
    const piece = buf;
    buf = "";
    onDelta(piece);
  };
  return {
    push(text: string) {
      buf += text;
      if (buf.length >= 120) {
        flush();
        return;
      }
      if (!timer) {
        timer = setTimeout(flush, 80);
      }
    },
    flush,
  };
}

function buildSystem(
  large: boolean,
  engine: string,
  agentBlock: string,
  website = false,
) {
  const leanFlash = large && engine === "flash";
  const finishRule = `FINISH RULE (non-negotiable):
- Output ONE complete JSON object only. Never stop mid-string or mid-file.
- files.app.html must be a full HTML document that ends with </html>.
- Prefer finishing a solid compact scaffold over an unfinished long one.
- Order files: app.html, package.json, schema.sql, api.ts, App.tsx, app/page.tsx, README.md (then optional).`;
  const scale = website
    ? `SCALE — SITE:
- app.html is a finished one-page website (hero, sections, contact). Not a multi-screen app.
- Companion files exist but stay short so app.html is not truncated.`
    : leanFlash
    ? `SCALE — PROJET MÉTIER COMPLET mais COMPACT (engine=flash):
- Priorité: app.html utilisable en Preview (3–5 écrans max), Tailwind CDN, mobile-first RDC.
- Inclure aussi: App.tsx, app/page.tsx, package.json, schema.sql, api.ts, README.md — versions courtes mais cohérentes.
- Mobile Money + prix CDF quand c’est une boutique / vente (voir barème paiement).
- window.Okapi.list/create pour listes/formulaires.
- PAS de Flutter / Python / React Native sauf demande explicite.
- Garde chaque fichier raisonnablement court pour finir le JSON sans coupure.`
    : large
      ? `SCALE — GRAND PROJET (engine=${engine}):
- Ship a real product skeleton for RDC businesses (CRM, boutique, école, clinique, flotte…).
- app.html: multi-screen SPA (nav + at least 4–6 views/modules), Tailwind CDN, mobile-first — polished spacing, hierarchy, empty/loading states (not wireframe stubs).
- App.tsx + app/page.tsx + package.json: mirror the same product tightly (Next/React runnable locally).
- schema.sql: several related tables, indexes, RLS policies, seed comments.
- api.ts: several route stubs (CRUD + auth/session where relevant).
- README.md: architecture + how to run Preview Okapi AND local Next/Flutter/Python.
- When Flutter is useful: ALWAYS include both main.dart AND pubspec.yaml — real screens (Material), not hello-world.
- When Python backend is useful: ALWAYS include main.py AND requirements.txt — usable FastAPI/Flask skeleton.
- Think end-to-end: list → detail → form → empty states → Mobile Money CDF/USSD when useful.
- Stay on the supported stack (HTML/React/Next/Flutter/Python/SQL) — never invent Java/C#/Go project files.`
      : `SCALE — APP:
- app.html has at least 3 working screens (data-go / data-screen) and visible sample rows.
- React, SQL, API, README stay coherent and shorter than app.html.
- Code must run in Preview. Not a single centered card.`;

  return `You are Okapi Studio (MMC SARL) — senior product engineer and coding coach for builders in DR Congo.
You plan like a tech lead, then deliver a complete multi-file project the user can Accept in Studio.
${agentBlock}

${finishRule}

STACK LOCK (non-negotiable):
- Full projects ONLY in: HTML · React · Next · Flutter · Python · SQL (plus api.ts / package.json / README / manifests).
- If the user asks Java, C#, Go, PHP, Ruby, Rust, Kotlin (hors Flutter), Swift, etc.: do NOT invent fake Studio files for that language. In "note", say honestly in French that Okapi livre HTML · React · Next · Flutter · Python · SQL — for that language you can explain later in Chat, but this Créer run should ship the closest supported equivalent (usually HTML Preview + React/Next). Never claim Preview runs Java/C#.
- Preview live = app.html only. React/Next/Flutter/Python = edit + ZIP export.

QUALITY (ce que l’utilisateur voit dans Preview — non-négociable):
${
  website
    ? `- This run is a WEBSITE. app.html is one scrolling page (hero, sections, contact). Not a dashboard, not a 4-screen admin.
- ${OKAPI_VITRINE_DESIGN}
- Companion files stay short. A leads form may use window.Okapi.create('leads').`
    : `- This run is an APP. app.html: nav that really changes screens, ≥3 écrans, sample rows visible before any fetch.
- ${OKAPI_MOBILE_MONEY_UX}
- Parcours: liste → formulaire → succès ; au moins un CRUD (créer / lire).
- States: empty + loading + error + succès. Forms validate before Okapi.create.
- Data: window.Okapi.list/create/update/remove with try/catch. Seed is visible HTML, then refresh from list.
- schema.sql, api.ts, App.tsx stay aligned with the same collection names, but shorter than app.html.`
}

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
    "package.json": "{ ... }",
    "schema.sql": "...",
    "api.ts": "...",
    "README.md": "..."
  }
}

Mandatory files for a complete app: app.html, App.tsx, app/page.tsx, package.json, schema.sql, api.ts, README.md.
Optional stacks (when relevant — always ship companion manifests):
- Flutter: main.dart + pubspec.yaml (never main.dart alone)
- Python: main.py + requirements.txt (never main.py alone)
- React Native: App.native.tsx

Rules:
1. ${scale}
2. app.html must be a full document (DOCTYPE … </html>), Tailwind CDN, RDC-friendly UX.
3. ${OKAPI_PRODUCT_DESIGN}
3b. If the brief is a vitrine / landing / portfolio: ${OKAPI_VITRINE_DESIGN}
4. Never invent real API keys. Prefer window.Okapi.list/create for live Preview data (Okapi cloud). Optional stubs in api.ts may mirror the same collections.
5. Never mention third-party AI or database vendor brand names in UI or README — say « base Okapi » / Okapi / MMC SARL.
6. UI copy in the user's language (French if they write French).
7. ${website ? "app.html is long and finished. Companion files stay short but valid — no lorem-only page." : "Every file must be substantial and coherent with the others — no empty stubs, no lorem-only pages."}
8. Prefer REAL Okapi data via window.Okapi (not localStorage demos) when building interactive lists/forms:
   - await Okapi.list('products'|'orders'|'patients'|…) → flat rows [{ id, ...fields }] (never row.data)
   - await Okapi.create(collection, data) → same flat shape
   - await Okapi.update(id, data) / Okapi.remove(id)
   - If list is empty: show empty state AND seed 1–2 demo rows with create on first load
   - Wrap async Okapi calls in try/catch; show a clear error message in the UI on failure
   Preview injects window.Okapi always (local memory if not saved; cloud after Sauver).
9. Always finish JSON completely — never truncate mid-string.
10. Follow the AGENT MÉTIER product rules above strictly (screens, SQL, API, RDC payments).
11. In README explain: Preview = base Okapi ; Next = npm i && npm run dev ; Flutter = flutter pub get ; Python = pip install -r requirements.txt.
12. package.json must be valid JSON with name, scripts (dev/build), and dependencies for the React/Next stubs.
13. pubspec.yaml must be valid YAML with name, environment sdk, and flutter dependencies when Flutter is included.
14. requirements.txt must list real pip packages (one per line) when Python is included.
15. ${website ? "The page scrolls: hero, sections, image, and a real CTA. Do not add a fake admin nav." : "Robustness: nav switches screens, at least one full path (list → add), no broken onclick / missing ids."}`;
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
      let content = value.trim();
      // Preview = app.html : fermer proprement si le LLM a coupé la fin.
      if (id === "app.html") {
        const openScript = (content.match(/<script\b/gi) || []).length;
        const closeScript = (content.match(/<\/script>/gi) || []).length;
        if (openScript > closeScript) content += "\n</script>";
        content = ensureHtmlDocument(content);
      }
      files.push({ fileId: id, content });
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
  engine: OkapiEngine;
  large: boolean;
  hintTitle?: string;
  agentBlock: string;
  agentLabel: string;
  workspace: ReturnType<typeof sanitizeStudioWorkspace>;
  history: ReturnType<typeof sanitizeStudioHistory>;
  onStatus?: (event: Extract<StudioStreamEvent, { type: "status" }>) => void;
  onDelta?: (text: string) => void;
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
    onDelta,
  } = opts;
  // Opus / grands scaffolds : plus de tokens pour éviter JSON coupé mid-stream.
  // Flash large aussi en 16k (Opus) — 12k coupait trop souvent app.html.
  const maxTokens =
    large && engine === "pro"
      ? 24_000
      : large
        ? 16_000
        : engine === "pro"
          ? 12_000
          : 8000;
  /** Skip soft auto-repair after this — second LLM pass often kills the request. */
  const REPAIR_BUDGET_MS = 90_000;
  const CONTINUE_BUDGET_MS = 140_000;
  const startedAt = Date.now();
  const website = wantsWebsiteBrief(instruction);
  const system =
    buildSystem(large, engine, agentBlock, website) +
    (website
      ? `\n\nWEBSITE MODE: one scrolling page in app.html. Companion files under 40 lines. Do not build a multi-screen admin. Follow the website contract in the user message.`
      : `\n\nAPP MODE: app.html has working data-go screens and visible sample rows. Follow the app contract in the user message.`);
  const total = 4;
  const delta = onDelta ? makeDeltaBatcher(onDelta) : null;

  const user = `Build what Preview will actually show. ${
    website
      ? "This is a WEBSITE: one polished scrolling page. Companion files stay short."
      : "This is an APP: working screens in app.html, with sample data visible immediately."
  }
Active métier agent: ${agentLabel}

BRIEF:
-----
${instruction}
-----
${hintTitle ? `Suggested title: ${hintTitle}` : ""}
Mode: ${website ? "SITE" : large ? "GRAND PROJET" : "APP"} · engine=${engine}

${website ? OKAPI_WEBSITE_CONTRACT : OKAPI_APP_CONTRACT}

AGENT HISTORY (recent):
${formatStudioHistory(history)}

EXISTING WORKSPACE (extend coherently if present):
${formatStudioWorkspaceContext(workspace)}

Return ONLY one complete JSON object with title, note, and files map.
CRITICAL — finish the JSON: no truncated strings.
PRIORITY #1: files.app.html is a full <!DOCTYPE html>…</html> document. This is what Preview runs.
PRIORITY #2: ${
    website
      ? "Keep App.tsx, app/page.tsx, schema.sql, api.ts, package.json, README under 40 lines so the page can finish."
      : "Keep App.tsx, schema.sql, api.ts, package.json, README coherent but shorter than app.html."
  }
Put app.html first in the files map. If you must cut, cut the companions, never app.html.`;

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
    message: "Écriture du code en direct…",
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
    onChunk: delta ? (t) => delta.push(t) : undefined,
  });
  delta?.flush();
  let repaired = false;

  // Reprise si le stream a coupé le JSON (symptôme : « le code ne finit pas »).
  if (
    looksTruncatedStudioOutput(raw) ||
    !extractJsonObject(raw)
  ) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < CONTINUE_BUDGET_MS) {
      onStatus?.({
        type: "status",
        message: "Reprise — le code a été coupé, Okapi termine…",
        step: 2,
        total,
        large,
        engine,
        repairing: true,
      });
      const continued = await complete({
        system,
        user: buildStudioContinuePrompt({
          instruction,
          previousRaw: raw,
          hintTitle,
        }),
        engine,
        maxTokens,
        onChunk: delta ? (t) => delta.push(t) : undefined,
      });
      delta?.flush();
      const contOk = extractJsonObject(continued);
      const contHasHtml = /<\/html>/i.test(continued);
      if (contHasHtml || contOk) {
        raw = continued;
      } else if (continued.trim().length > raw.trim().length * 0.5) {
        raw = continued;
      }
    }
  }

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
  let issues = assessStudioProjectFiles(files, { large, website });

  const hardFail =
    !parsed ||
    files.length === 0 ||
    !files.some((f) => f.fileId === "app.html");
  if (hardFail && (!parsed || files.length === 0)) {
    issues = [
      {
        code: "invalid_json",
        detail:
          "Previous response was not valid project JSON or had no files.",
      },
      ...issues,
    ];
  }

  const elapsedAfterFirst = Date.now() - startedAt;
  const hardNeedsRepair = hardFail || mustRepairStudioProject(issues);
  // Soft repair: Pro toujours ; Flash si HTML trop mince (tronqué = déjà en hard).
  const softNeedsRepair =
    !hardNeedsRepair &&
    shouldRepairStudioProject(issues) &&
    (engine === "pro" ||
      issues.some((i) =>
        ["html_too_short", "html_weak_navigation", "html_weak_website", "html_placeholder", "html_missing_states"].includes(
          i.code,
        ),
      ));
  const needsRepair =
    Boolean(raw.trim()) &&
    (hardNeedsRepair ||
      (softNeedsRepair && elapsedAfterFirst < REPAIR_BUDGET_MS));

  if (needsRepair) {
    onStatus?.({
      type: "status",
      message: hardNeedsRepair
        ? "Auto-correction du projet en cours…"
        : "Amélioration rapide du scaffold…",
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
      maxTokens: hardNeedsRepair ? maxTokens : Math.min(maxTokens, 8000),
      onChunk: delta
        ? (t) => {
            delta.push(t);
          }
        : undefined,
    });
    delta?.flush();
    repaired = true;
    const repairedParsed = extractJsonObject(raw);
    const repairedFiles = repairedParsed
      ? parseProjectFiles(repairedParsed)
      : [];
    // Keep the first pass if repair made things worse / empty.
    if (
      repairedParsed &&
      repairedFiles.some((f) => f.fileId === "app.html")
    ) {
      parsed = repairedParsed;
      files = repairedFiles;
      issues = assessStudioProjectFiles(files, { large, website });
    }
  } else if (softNeedsRepair && elapsedAfterFirst >= REPAIR_BUDGET_MS) {
    onStatus?.({
      type: "status",
      message: "Livraison de la base (amélioration reportée)…",
      step: 3,
      total,
      large,
      engine,
    });
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Réponse projet invalide. Réessaie.");
  }

  if (files.length === 0 || !files.some((f) => f.fileId === "app.html")) {
    throw new Error("Projet vide. Reformule ta demande.");
  }

  const title =
    (typeof parsed.title === "string" && parsed.title.trim()) ||
    hintTitle ||
    "Projet Okapi";
  const baseNote =
    (typeof parsed.note === "string" && parsed.note.trim()) ||
    `Projet « ${title} » · ${files.length} fichiers prêts.`;
  const softLeft =
    !repaired && softNeedsRepair
      ? " Base livrée — dis « améliore le projet » pour renforcer."
      : softNeedsRepair && repaired
        ? ""
        : shouldRepairStudioProject(issues)
          ? " Tu peux encore demander des améliorations."
          : "";
  const note = repaired
    ? `${baseNote} (Okapi a auto-corrigé la génération.)`
    : `${baseNote}${softLeft}`;

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
    note,
    large,
    repaired,
    qualityIssues: issues.map((i) => i.code),
    files,
  };
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 1_500_000);
  if (tooBig) return tooBig;

  if (!pickWithClaude()) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

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

  const access = await resolveLlmAccess(request);
  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "generate", {
    paid: access.paid,
  });
  if (!quota.ok) return quotaExceededResponse(quota);

  const engine = resolveEngineForPlan(body?.engine ?? "pro", access.paid);
  // Only true “plateforme / CRM / …” briefs get the heavy large prompt — not every Pro call.
  const large = wantsLargeProject(instruction);
  const hintTitle = body?.title?.trim();
  const workspace = sanitizeStudioWorkspace(body?.workspace);
  const history = sanitizeStudioHistory(body?.history);
  const wantStream = body?.stream !== false;
  const agent = resolveOkapiAgent({
    agentId: body?.agentId,
    sector: body?.sector,
    instruction,
  });
  let agentBlock = agentSystemBlock(agent);
  try {
    const session = await getUserFromAuthHeader(request);
    if (session) {
      const memory = await loadUserIntelligenceContext(
        session.supabase,
        session.user.id,
        session.user,
      );
      agentBlock += intelligenceSystemBlock(memory);
    }
  } catch {
    // invité OK
  }

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
    } finally {
      releaseGenerateSlot();
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
          onDelta: (text) => send({ type: "delta", text }),
        });
        for (const f of result.files) {
          send({ type: "file", fileId: f.fileId, content: f.content });
        }
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
