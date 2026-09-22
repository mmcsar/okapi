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
  "package.json",
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
  const large = Boolean(opts?.large);

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
      const minHtml = large ? 1800 : 800;
      if (html.length < minHtml) {
        issues.push({
          code: "html_too_short",
          detail: `app.html is too short for a robust ${large ? "large " : ""}Preview product.`,
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
      const usesOkapi =
        /window\.Okapi|Okapi\.(list|create|update|remove)\s*\(/i.test(html);
      const usesLocalStorage = /\blocalStorage\b/i.test(html);
      if (usesLocalStorage && !usesOkapi) {
        issues.push({
          code: "localstorage_without_okapi",
          detail:
            "app.html uses localStorage — prefer window.Okapi.list/create for live Preview cloud.",
        });
      }
      const looksInteractive =
        usesLocalStorage ||
        /<form\b/i.test(html) ||
        /Okapi\.(list|create)\s*\(/i.test(html) ||
        /\.addEventListener\s*\(\s*['"]submit['"]/i.test(html);
      if (looksInteractive && !usesOkapi) {
        issues.push({
          code: "interactive_without_okapi",
          detail:
            "Interactive app.html should use window.Okapi.list/create for persistence.",
        });
      }
      const screenHints = (
        html.match(
          /\b(data-view|data-screen|id=["'](?:view|screen|page|tab)-|showView|navigateTo|nav-item|role=["']tab["'])/gi,
        ) || []
      ).length;
      const navHints = (html.match(/<nav\b|navbar|bottom-nav|sidebar/gi) || [])
        .length;
      if (large && screenHints + navHints < 2) {
        issues.push({
          code: "html_weak_navigation",
          detail:
            "Large project app.html needs real multi-screen navigation (nav + views).",
        });
      }
      if (
        looksInteractive &&
        !/\b(empty|vide|loading|chargement|erreur|error|toast|alert)\b/i.test(
          html,
        )
      ) {
        issues.push({
          code: "html_missing_states",
          detail:
            "Robust Preview needs empty/loading/error (or toast) UI states.",
        });
      }
    }
  }

  const sql = byId.get("schema.sql")?.trim() || "";
  if (sql) {
    if (sql.length < (large ? 120 : 60)) {
      issues.push({
        code: "sql_too_short",
        detail: "schema.sql is too short for a robust data model.",
      });
    }
    if (!/\bcreate\s+table\b/i.test(sql)) {
      issues.push({
        code: "sql_no_tables",
        detail: "schema.sql must define at least one CREATE TABLE.",
      });
    }
  }

  const api = byId.get("api.ts")?.trim() || "";
  if (api && api.length < (large ? 200 : 80)) {
    issues.push({
      code: "api_too_short",
      detail: "api.ts stubs are too thin for a robust backend scaffold.",
    });
  }

  const react = byId.get("App.tsx")?.trim() || "";
  if (react) {
    if (react.length < (large ? 250 : 100)) {
      issues.push({
        code: "react_too_short",
        detail: "App.tsx is too short — mirror the HTML product properly.",
      });
    }
    if (!/export\s+default/i.test(react)) {
      issues.push({
        code: "react_no_export",
        detail: "App.tsx should export a default component.",
      });
    }
  }

  const pkg = byId.get("package.json")?.trim() || "";
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      if (!parsed || typeof parsed !== "object") {
        issues.push({
          code: "package_json_invalid",
          detail: "package.json is not valid JSON object.",
        });
      } else if (!parsed.scripts || typeof parsed.scripts !== "object") {
        issues.push({
          code: "package_json_no_scripts",
          detail: "package.json needs scripts (at least dev/build).",
        });
      }
    } catch {
      issues.push({
        code: "package_json_invalid",
        detail: "package.json is not valid JSON.",
      });
    }
  }

  const hasFlutter = Boolean(byId.get("main.dart")?.trim());
  const hasPubspec = Boolean(byId.get("pubspec.yaml")?.trim());
  if (hasFlutter && !hasPubspec) {
    issues.push({
      code: "missing_pubspec_yaml",
      detail: "Flutter main.dart requires pubspec.yaml for a real project.",
    });
  }

  const hasPython = Boolean(byId.get("main.py")?.trim());
  const hasReqs = Boolean(byId.get("requirements.txt")?.trim());
  if (hasPython && !hasReqs) {
    issues.push({
      code: "missing_requirements_txt",
      detail: "Python main.py requires requirements.txt for a real project.",
    });
  }

  return issues;
}

export function shouldRepairStudioProject(issues: StudioQualityIssue[]) {
  return issues.some(
    (i) =>
      [
        "html_invalid",
        "html_truncated",
        "html_too_short",
        "html_unclosed_script",
        "html_weak_navigation",
        "html_missing_states",
        "interactive_without_okapi",
        "sql_too_short",
        "sql_no_tables",
        "api_too_short",
        "react_too_short",
        "react_no_export",
        "package_json_invalid",
        "package_json_no_scripts",
        "missing_pubspec_yaml",
        "missing_requirements_txt",
        "localstorage_without_okapi",
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
2. Include ALL mandatory files: app.html, App.tsx, app/page.tsx, package.json, schema.sql, api.ts, README.md.
3. If main.dart exists, also include pubspec.yaml. If main.py exists, also include requirements.txt.
4. Fix truncation / missing sections. Prefer completing previous content over rewriting from scratch.
5. app.html must be a full document ending with </html> — multi-screen, empty/loading/error states, window.Okapi for data.
6. package.json must be valid JSON with scripts.
7. Prefer window.Okapi.list/create over localStorage for interactive lists/forms.
8. schema.sql needs real CREATE TABLE(s). api.ts and App.tsx must be substantial, not stubs.
${opts.titleHint ? `Suggested title: ${opts.titleHint}` : ""}

Previous incomplete JSON / output:
-----
${opts.previousRaw.slice(0, 28000)}
-----`;
}
