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
  STUDIO_FILE_IDS,
  type StudioFileId,
} from "@/lib/studio-files";

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
  "README.md": "Markdown documentation in French.",
  "main.py": "Python 3 script or FastAPI-style stubs. No markdown fences.",
  "main.dart": "Flutter / Dart widget code. No markdown fences.",
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
  const engine = resolveEngine(body?.engine);
  const workspace = sanitizeStudioWorkspace(body?.workspace);
  const history = sanitizeStudioHistory(body?.history);
  const multiBias = prefersMultiFile(instruction);
  const maxTokens = multiBias || engine === "pro" ? 12000 : 8000;
  const agent = resolveOkapiAgent({
    agentId: body?.agentId,
    sector: body?.sector,
    instruction,
  });
  const system = buildSystem(
    fileId,
    language,
    multiBias,
    agentSystemBlock(agent),
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

  try {
    const raw = await complete({ system, user, engine, maxTokens });
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
      return Response.json({
        ok: true,
        multi: true,
        note,
        files: multi,
        // Compat single-field consumers
        fileId: multi[0]!.fileId,
        content: multi[0]!.content,
        usedContext: {
          siblings: workspace.filter(
            (f) => f.fileId !== fileId && f.content?.trim(),
          ).length,
          historyTurns: history.length,
        },
      });
    }

    // Single-file path (or JSON with exactly 1 file)
    if (multi.length === 1) {
      return Response.json({
        ok: true,
        multi: false,
        fileId: multi[0]!.fileId,
        content: multi[0]!.content,
        note:
          (typeof parsed?.note === "string" && parsed.note.trim()) ||
          `Fichier ${multi[0]!.fileId} mis à jour.`,
        files: multi,
        usedContext: {
          siblings: workspace.filter(
            (f) => f.fileId !== fileId && f.content?.trim(),
          ).length,
          historyTurns: history.length,
        },
      });
    }

    const next = stripFences(raw);
    if (!next || next.startsWith("{")) {
      return Response.json(
        { error: "L’IA n’a renvoyé aucun code exploitable. Réessaie." },
        { status: 502 },
      );
    }

    return Response.json({
      ok: true,
      multi: false,
      fileId,
      content: next,
      note: `Fichier ${fileLabel} mis à jour.`,
      files: [{ fileId, content: next }],
      agentId: agent.id,
      agentLabel: agent.label,
      usedContext: {
        siblings: workspace.filter(
          (f) => f.fileId !== fileId && f.content?.trim(),
        ).length,
        historyTurns: history.length,
      },
    });
  } catch (err) {
    return Response.json({ error: friendlyLlmError(err) }, { status: 502 });
  }
}
