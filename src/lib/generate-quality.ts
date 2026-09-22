/** Post-generate quality checks + repair prompts for Okapi builder. */

import type { GenerateMode, OkapiGenerateArtifacts } from "@/lib/fullstack";

export type GenerateQualityIssue = {
  code: string;
  detail: string;
};

const MAX_REPAIR_ATTEMPTS = 1;

export function maxGenerateRepairAttempts() {
  return MAX_REPAIR_ATTEMPTS;
}

function countTag(html: string, open: RegExp, close: RegExp) {
  return {
    open: (html.match(open) || []).length,
    close: (html.match(close) || []).length,
  };
}

/**
 * Detect incomplete / unusable generate output.
 * Used to trigger one automatic repair pass.
 */
export function assessGenerateQuality(
  artifacts: OkapiGenerateArtifacts,
  opts: { mode: GenerateMode; raw: string },
): GenerateQualityIssue[] {
  const issues: GenerateQualityIssue[] = [];
  const html = artifacts.html?.trim() || "";
  const lower = html.toLowerCase();
  const rawLower = opts.raw.toLowerCase();

  if (!lower.includes("<html")) {
    issues.push({
      code: "no_html",
      detail: "Missing a complete HTML document starting with <!DOCTYPE html> / <html>.",
    });
    return issues;
  }

  if (html.length < 350) {
    issues.push({
      code: "too_short",
      detail: "HTML is too short to be a usable app preview.",
    });
  } else if (opts.mode === "fullstack" && html.length < 1200) {
    issues.push({
      code: "too_thin",
      detail: "Fullstack HTML is too thin for a robust multi-screen product.",
    });
  }

  // Truncation: model never closed the document (ensureHtmlDocument may have patched it).
  if (!rawLower.includes("</html>")) {
    issues.push({
      code: "truncated_html",
      detail: "HTML was truncated before </html>.",
    });
  }

  const scripts = countTag(html, /<script\b/gi, /<\/script>/gi);
  if (scripts.open > scripts.close) {
    issues.push({
      code: "unclosed_script",
      detail: "One or more <script> tags are unclosed (likely truncation).",
    });
  }

  const styles = countTag(html, /<style\b/gi, /<\/style>/gi);
  if (styles.open > styles.close) {
    issues.push({
      code: "unclosed_style",
      detail: "One or more <style> tags are unclosed (likely truncation).",
    });
  }

  if (opts.mode === "fullstack") {
    if (!artifacts.sql) {
      issues.push({
        code: "missing_sql",
        detail: "Fullstack output missing ===OKAPI_SQL=== section.",
      });
    } else if (
      artifacts.sql.trim().length < 60 ||
      !/\bcreate\s+table\b/i.test(artifacts.sql)
    ) {
      issues.push({
        code: "weak_sql",
        detail: "SQL schema too weak — need real CREATE TABLE(s).",
      });
    }
    if (!artifacts.api) {
      issues.push({
        code: "missing_api",
        detail: "Fullstack output missing ===OKAPI_API=== section.",
      });
    } else if (artifacts.api.trim().length < 80) {
      issues.push({
        code: "weak_api",
        detail: "API stubs too thin for a robust backend scaffold.",
      });
    }
    if (!artifacts.react) {
      issues.push({
        code: "missing_react",
        detail: "Fullstack output missing ===OKAPI_REACT=== section.",
      });
    } else if (artifacts.react.trim().length < 100) {
      issues.push({
        code: "weak_react",
        detail: "React stub too short — mirror the HTML product.",
      });
    }
    if (!artifacts.nextjs) {
      issues.push({
        code: "missing_next",
        detail: "Fullstack output missing ===OKAPI_NEXT=== section.",
      });
    }
  }

  const usesOkapi = /window\.Okapi|Okapi\.(list|create|update|remove)\s*\(/i.test(
    html,
  );
  const usesLocalStorage = /\blocalStorage\b/i.test(html);
  const looksInteractive =
    usesLocalStorage ||
    /<form\b/i.test(html) ||
    /\.addEventListener\s*\(\s*['"]submit['"]/i.test(html) ||
    /Okapi\.(list|create)\s*\(/i.test(html);

  if (looksInteractive && usesLocalStorage && !usesOkapi) {
    issues.push({
      code: "localstorage_without_okapi",
      detail:
        "Interactive HTML uses localStorage instead of window.Okapi.list/create (real Okapi cloud).",
    });
  }

  if (looksInteractive && !usesOkapi) {
    issues.push({
      code: "interactive_without_okapi",
      detail:
        "Interactive Preview should use window.Okapi.list/create for persistence.",
    });
  }

  if (
    opts.mode === "fullstack" &&
    looksInteractive &&
    !/\b(empty|vide|loading|chargement|erreur|error|toast)\b/i.test(html)
  ) {
    issues.push({
      code: "missing_ui_states",
      detail: "Robust app needs empty/loading/error UI feedback.",
    });
  }

  return issues;
}

export function shouldRepairGenerate(issues: GenerateQualityIssue[]) {
  return issues.some((i) =>
    [
      "no_html",
      "too_short",
      "too_thin",
      "truncated_html",
      "unclosed_script",
      "unclosed_style",
      "missing_sql",
      "missing_api",
      "missing_react",
      "missing_next",
      "weak_sql",
      "weak_api",
      "weak_react",
      "localstorage_without_okapi",
      "interactive_without_okapi",
      "missing_ui_states",
    ].includes(i.code),
  );
}

/** User prompt for a focused repair pass (keeps original brief + issues). */
export function buildGenerateRepairPrompt(opts: {
  sector: string;
  message: string;
  mode: GenerateMode;
  issues: GenerateQualityIssue[];
  previousRaw: string;
  language?: string | null;
}) {
  const issueList = opts.issues
    .map((i) => `- [${i.code}] ${i.detail}`)
    .join("\n");

  const formatHint =
    opts.mode === "fullstack"
      ? `Return ALL markers again:
===OKAPI_HTML===
===OKAPI_REACT===
===OKAPI_NEXT===
===OKAPI_SQL===
===OKAPI_API===
===OKAPI_README===
===OKAPI_END===`
      : `Return ONLY the full HTML document (<!DOCTYPE html> … </html>). No markdown.`;

  return `Sector: ${opts.sector}
Mode: REPAIR — fix the previous Okapi generation (do not restart from a blank idea).

Original user request:
${opts.message}

Quality problems detected:
${issueList}

Rules for this repair:
1. Fix every listed problem.
2. Keep the same product intent and language as the request.
3. Prefer completing / closing truncated content over rewriting everything.
4. Always finish completely — never cut off mid-tag.
5. If localStorage was used for lists/forms: replace with window.Okapi.list/create/update/remove. list returns flat rows [{id,...fields}] — never row.data. Empty list → empty state + optional seed create.
6. Make the product more robust: multi-screen nav if missing, empty/loading/error UI, real SQL CREATE TABLE, non-empty React/API stubs.
7. ${formatHint}

Previous (incomplete) output to repair:
${opts.previousRaw.slice(0, 24000)}`;
}
