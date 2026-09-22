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
import {
  formatStudioHistory,
  formatStudioWorkspaceContext,
  sanitizeStudioHistory,
  sanitizeStudioWorkspace,
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
export const maxDuration = 90;

const FILE_HINTS: Record<string, string> = {
  "app.html": "Complete single-file HTML document (start with <!DOCTYPE html>).",
  "App.tsx": "React + TypeScript component file (functional components, modern React).",
  "App.native.tsx":
    "React Native screen/component (TypeScript). Use react-native primitives (View, Text, Pressable, StyleSheet). No DOM/HTML. No markdown fences.",
  "app/page.tsx":
    "Next.js App Router page.tsx (TypeScript). Use server/client components correctly. Export default page component. No markdown fences.",
  "schema.sql":
    "PostgreSQL schema: tables, constraints, indexes, optional RLS policies. SQL only. Comments in French OK.",
  "api.ts":
    "Backend API stubs in TypeScript (REST handlers or Next.js route.ts style). No markdown fences.",
  "package.json":
    "Valid package.json for Next/React (name, scripts, dependencies). JSON only, no markdown.",
  "pubspec.yaml":
    "Valid Flutter pubspec.yaml (name, environment, dependencies). YAML only, no markdown.",
  "requirements.txt":
    "Python pip requirements, one package per line. No markdown fences.",
  "README.md": "Markdown documentation in French.",
  "main.py": "Python 3 script or FastAPI-style stubs. No markdown fences.",
  "main.dart": "Flutter / Dart lib/main.dart entry. No markdown fences.",
};

type Body = {
  instruction?: string;
  fileId?: string;
  fileLabel?: string;
  language?: string;
  content?: string;
  engine?: string;
  agentId?: string;
  sector?: string;
  workspace?: unknown;
  history?: unknown;
  stream?: boolean;
};

function stripFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:[\w.+-]*)?\s*\n?([\s\S]*?)\n?```$/);
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

/** Prefer multi-file JSON when the brief clearly spans several artifacts. */
function prefersMultiFile(instruction: string): boolean {
  const m = instruction.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return /\b(plusieurs fichiers|tous les fichiers|partout|coherent|cohérence|et le sql|et l'api|et l api|et react|et next|html et|sql et|schema et|api et|mise a jour globale|synchronis|aligne|aligner)\b/i.test(
    m,
  );
}

function buildSystem(
  fileId: string,
  language: string,
  multiBias: boolean,
  agentBlock: string,
) {
  const hint = FILE_HINTS[fileId] || `Source file (${language}).`;
  return `You are Okapi Studio AI (MMC SARL). You edit code inside Okapi Studio.
${agentBlock}
OUTPUT — choose ONE format:

A) SINGLE FILE (only the active file changes):
Return ONLY the full updated file content. No markdown fences. No JSON.

B) MULTI FILE (2+ files must change for consistency — e.g. HTML + SQL + API):
Return ONLY valid JSON:
{
  "note": "Court résumé FR des fichiers touchés",
  "files": {
    "app.html": "...full content...",
    "schema.sql": "...",
    "api.ts": "..."
  }
}
Include every file you change (full content each). Allowed keys: ${STUDIO_FILE_IDS.join(", ")}.

Rules:
- Keep the user's intent. Improve or create code as asked.
- Prefer B when the change touches data model, API contracts, or mirrored UI (React/Next/HTML).
- Prefer A for local UI/copy tweaks on the active file only.
${multiBias ? "- This request likely needs MULTI FILE (format B)." : ""}
- STACK: only edit allowed Studio files (HTML · React · Next · Flutter · Python · SQL · api · package · README). If the user asks for Java/C#/Go/PHP/etc. as a new project language: refuse to invent that file — reply in a short note (put honesty in the edited file comment or keep prior content and say in chat via note) that Okapi Studio does not ship that stack; improve the active supported file instead or suggest HTML/React/Flutter equivalent.
- Quality: deepen HTML/React/Flutter/Python already in the workspace — polished UI, coherent siblings — do not dilute with unsupported stacks.
- Use WORKSPACE CONTEXT to stay consistent with sibling files.
- Use AGENT HISTORY for continuity.
- Never name third-party AI/cloud vendors (say Okapi / MMC SARL).
- Do not embed secrets or API keys.
- Active file default target: ${fileId} (${hint})
- Prefer French for UI strings / README when the user writes in French.`;
}

async function complete(opts: {
  system: string;
  user: string;
  engine: ReturnType<typeof resolveEngine>;
  maxTokens: number;
  onChunk?: (text: string) => void;
}) {
  const provider = pickLlmProvider();
  if (!provider) throw new Error(missingLlmMessage());

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
      onChunk: opts.onChunk,
    });
  }
  throw new Error(missingLlmMessage());
}

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
      if (!timer) timer = setTimeout(flush, 80);
    },
    flush,
  };
}

function parseMultiFiles(
  parsed: Record<string, unknown>,
): { fileId: StudioFileId; content: string }[] {
  const filesRaw = parsed.files;
  if (!filesRaw || typeof filesRaw !== "object") return [];
  const out: { fileId: StudioFileId; content: string }[] = [];
  for (const id of STUDIO_FILE_IDS) {
    const value = (filesRaw as Record<string, unknown>)[id];
    if (typeof value === "string" && value.trim()) {
      out.push({ fileId: id, content: value.trim() });
    }
  }
  return out;
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 1_500_000);
  if (tooBig) return tooBig;

  if (!pickLlmProvider()) {
    return Response.json({ error: missingLlmMessage() }, { status: 500 });
  }

  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "chat");
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as Body | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) {
    return Response.json({ error: "Dis ce que tu veux modifier." }, { status: 400 });
  }
  if (instruction.length > 8000) {
    return Response.json(
      { error: "Instruction trop longue." },
      { status: 400 },
    );
  }

  const fileId = body?.fileId?.trim() || "app.html";
  if (!FILE_HINTS[fileId]) {
    return Response.json({ error: "Fichier non autorisé." }, { status: 400 });
  }

  const fileLabel = body?.fileLabel?.trim() || fileId;
  const language = body?.language?.trim() || "plaintext";
  const content = (body?.content ?? "").slice(0, 400_000);
  const engine = resolveEngine(body?.engine ?? "pro");
  const workspace = sanitizeStudioWorkspace(body?.workspace);
  const history = sanitizeStudioHistory(body?.history);
  const multiBias = prefersMultiFile(instruction);
  const maxTokens = multiBias || engine === "pro" ? 12000 : 8000;
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
      );
      agentBlock += intelligenceSystemBlock(memory);
    }
  } catch {
    // invité OK
  }
  const system = buildSystem(
    fileId,
    language,
    multiBias,
    agentBlock,
  );
  const user = `Active file: ${fileLabel} (${language})
Instruction: ${instruction}

AGENT HISTORY (recent):
${formatStudioHistory(history)}

WORKSPACE CONTEXT (sibling files — stay consistent):
${formatStudioWorkspaceContext(workspace, { excludeFileId: fileId })}

Current active file content:
-----
${content || "(empty file — create from scratch)"}
-----

Return format A (single file body) OR format B (JSON multi-file).`;

  const wantStream = body?.stream !== false;
  const usedContext = {
    siblings: workspace.filter(
      (f) => f.fileId !== fileId && f.content?.trim(),
    ).length,
    historyTurns: history.length,
  };

  type EditResult = {
    ok: true;
    multi: boolean;
    note: string;
    fileId: string;
    content: string;
    files: { fileId: StudioFileId; content: string }[];
    agentId: string;
    agentLabel: string;
    usedContext: typeof usedContext;
  };

  async function runEdit(
    onDelta?: (text: string) => void,
  ): Promise<EditResult> {
    const batcher = onDelta ? makeDeltaBatcher(onDelta) : null;
    const raw = await complete({
      system,
      user,
      engine,
      maxTokens,
      onChunk: batcher ? (t) => batcher.push(t) : undefined,
    });
    batcher?.flush();

    const parsed = extractJsonObject(raw);
    const multi =
      parsed &&
      typeof parsed === "object" &&
      parsed.files &&
      typeof parsed.files === "object"
        ? parseMultiFiles(parsed)
        : [];

    if (multi.length >= 2) {
      const note =
        (typeof parsed?.note === "string" && parsed.note.trim()) ||
        `${multi.length} fichiers proposés.`;
      return {
        ok: true,
        multi: true,
        note,
        fileId: multi[0]!.fileId,
        content: multi[0]!.content,
        files: multi,
        agentId: agent.id,
        agentLabel: agent.label,
        usedContext,
      };
    }

    if (multi.length === 1) {
      return {
        ok: true,
        multi: false,
        note:
          (typeof parsed?.note === "string" && parsed.note.trim()) ||
          `Fichier ${multi[0]!.fileId} mis à jour.`,
        fileId: multi[0]!.fileId,
        content: multi[0]!.content,
        files: multi,
        agentId: agent.id,
        agentLabel: agent.label,
        usedContext,
      };
    }

    const next = stripFences(raw);
    if (!next || next.startsWith("{")) {
      throw new Error("L’IA n’a renvoyé aucun code exploitable. Réessaie.");
    }

    return {
      ok: true,
      multi: false,
      note: `Fichier ${fileLabel} mis à jour.`,
      fileId,
      content: next,
      files: [{ fileId: fileId as StudioFileId, content: next }],
      agentId: agent.id,
      agentLabel: agent.label,
      usedContext,
    };
  }

  if (!wantStream) {
    try {
      const result = await runEdit();
      return Response.json(result);
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
        send({
          type: "status",
          message: `Écriture de ${fileLabel}…`,
          step: 1,
          total: 2,
          engine,
        });
        const result = await runEdit((text) => send({ type: "delta", text }));
        send({
          type: "status",
          message: "Préparation des diffs…",
          step: 2,
          total: 2,
        });
        for (const f of result.files) {
          send({ type: "file", fileId: f.fileId, content: f.content });
        }
        send({
          type: "done",
          note: result.note,
          multi: result.multi,
          files: result.files,
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
