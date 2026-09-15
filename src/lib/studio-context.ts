/** Shared Studio AI context: workspace snapshots + chat history + project quality. */

import {
  STUDIO_FILE_IDS,
  type StudioFileId,
} from "@/lib/studio-files";

export type StudioHistoryMsg = {
  role: "user" | "assistant";
  content: string;
};

export type StudioWorkspaceFile = {
  fileId: string;
  label?: string;
  content?: string;
};

const MANDATORY: StudioFileId[] = [
  "app.html",
  "App.tsx",
  "app/page.tsx",
  "schema.sql",
  "api.ts",
  "README.md",
];

const MAX_SIBLING_CHARS = 2200;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 600;

export type StudioQualityIssue = {
  code: string;
  detail: string;
};

/** Compact map of other workspace files for LLM context. */
export function formatStudioWorkspaceContext(
  files: StudioWorkspaceFile[] | undefined,
  opts?: { excludeFileId?: string; maxFiles?: number },
): string {
  if (!files?.length) return "(workspace vide)";

  const exclude = opts?.excludeFileId;
  const maxFiles = opts?.maxFiles ?? 8;
  const rows = files
    .filter((f) => f.fileId && f.fileId !== exclude)
    .filter((f) => (f.content || "").trim().length > 0)
    .slice(0, maxFiles);

  if (rows.length === 0) return "(aucun autre fichier renseigné)";

  return rows
    .map((f) => {
      const raw = (f.content || "").trim();
      const clipped =
        raw.length > MAX_SIBLING_CHARS
          ? `${raw.slice(0, MAX_SIBLING_CHARS)}\n…[tronqué ${raw.length - MAX_SIBLING_CHARS} car.]`
          : raw;
      return `### ${f.label || f.fileId} (${raw.length} car.)\n${clipped}`;
    })
    .join("\n\n");
}

/** Last N agent turns (user/assistant) for continuity. */
export function formatStudioHistory(
  history: StudioHistoryMsg[] | undefined,
): string {
  if (!history?.length) return "(pas d’historique)";

  const turns = history
    .filter((m) => m.content?.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => {
      const text =
        m.content.length > MAX_HISTORY_CHARS
          ? `${m.content.slice(0, MAX_HISTORY_CHARS)}…`
          : m.content;
      return `${m.role === "user" ? "User" : "Okapi"}: ${text}`;
    });

  return turns.length ? turns.join("\n") : "(pas d’historique)";
}

export function sanitizeStudioHistory(
  history: unknown,
): StudioHistoryMsg[] {
  if (!Array.isArray(history)) return [];
  const out: StudioHistoryMsg[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: string }).role;
    const content = (item as { content?: string }).content;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim()
    ) {
      out.push({ role, content: content.trim().slice(0, 2000) });
    }
  }
  return out.slice(-MAX_HISTORY_TURNS);
}

export function sanitizeStudioWorkspace(
  workspace: unknown,
): StudioWorkspaceFile[] {
  if (!Array.isArray(workspace)) return [];
  const out: StudioWorkspaceFile[] = [];
  for (const item of workspace) {
    if (!item || typeof item !== "object") continue;
    const fileId = (item as { fileId?: string }).fileId?.trim();
    if (!fileId || !STUDIO_FILE_IDS.includes(fileId as StudioFileId)) continue;
    const label = (item as { label?: string }).label?.trim();
    const content = (item as { content?: string }).content;
    out.push({
      fileId,
      label: label || fileId,
      content: typeof content === "string" ? content.slice(0, 80_000) : "",
    });
  }
  return out;
}

export function assessStudioProjectFiles(
  files: { fileId: StudioFileId; content: string }[],
  opts?: { large?: boolean },
): StudioQualityIssue[] {
  const issues: StudioQualityIssue[] = [];
  const byId = new Map(files.map((f) => [f.fileId, f.content]));

  for (const id of MANDATORY) {
    const content = byId.get(id)?.trim() || "";
    if (!content) {
      issues.push({
        code: `missing_${id.replace(/[./]/g, "_")}`,
        detail: `Missing mandatory file: ${id}`,
      });
    }
  }

  const html = byId.get("app.html")?.trim() || "";
  if (html) {
    const lower = html.toLowerCase();
    if (!lower.includes("<html")) {
      issues.push({
        code: "html_invalid",
        detail: "app.html is not a complete HTML document.",
      });
    } else {
      if (!lower.includes("</html>")) {
        issues.push({
          code: "html_truncated",
          detail: "app.html missing </html> (likely truncated).",
        });
      }
      if (html.length < 400) {
        issues.push({
          code: "html_too_short",
          detail: "app.html is too short for a usable Preview.",
        });
      }
      const openScript = (html.match(/<script\b/gi) || []).length;
      const closeScript = (html.match(/<\/script>/gi) || []).length;
      if (openScript > closeScript) {
        issues.push({
          code: "html_unclosed_script",
          detail: "app.html has unclosed <script> tags.",
        });
      }
      if (opts?.large && (html.match(/\b(nav|tab|view|écran|section)/gi) || []).length < 2) {
        // soft signal only — don't block alone; skip for repair unless paired
      }
    }
  }

  const sql = byId.get("schema.sql")?.trim() || "";
  if (sql && sql.length < 40) {
    issues.push({
      code: "sql_too_short",
      detail: "schema.sql is too short.",
    });
  }

  return issues;
}

export function shouldRepairStudioProject(issues: StudioQualityIssue[]) {
  return issues.some((i) =>
    [
      "html_invalid",
      "html_truncated",
      "html_too_short",
      "html_unclosed_script",
      "sql_too_short",
    ].includes(i.code) || i.code.startsWith("missing_"),
  );
}

export function buildStudioProjectRepairPrompt(opts: {
  instruction: string;
  issues: StudioQualityIssue[];
  previousRaw: string;
  titleHint?: string;
}) {
  const list = opts.issues.map((i) => `- [${i.code}] ${i.detail}`).join("\n");
  return `REPAIR MODE — fix the previous Okapi Studio JSON project. Do not invent a different product.

Original brief:
${opts.instruction}

Problems detected:
${list}

Rules:
1. Return ONLY valid JSON with title, note, files (same schema as before).
2. Include ALL mandatory files: app.html, App.tsx, app/page.tsx, schema.sql, api.ts, README.md.
3. Fix truncation / missing sections. Prefer completing previous content over rewriting from scratch.
4. app.html must be a full document ending with </html>.
${opts.titleHint ? `Suggested title: ${opts.titleHint}` : ""}

Previous incomplete JSON / output:
-----
${opts.previousRaw.slice(0, 28000)}
-----`;
}
