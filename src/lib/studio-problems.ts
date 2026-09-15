/** Lightweight static diagnostics for Okapi Studio Problems panel. */

import type { StudioFileId } from "@/lib/studio-files";

export type StudioProblemSeverity = "error" | "warning" | "info";

export type StudioProblem = {
  id: string;
  severity: StudioProblemSeverity;
  fileId: StudioFileId;
  message: string;
  line?: number;
};

function lineOf(content: string, index: number): number | undefined {
  if (index < 0) return undefined;
  return content.slice(0, index).split("\n").length;
}

function analyzeHtml(html: string): StudioProblem[] {
  const out: StudioProblem[] = [];
  const trimmed = html.trim();
  if (!trimmed) return out;

  const lower = trimmed.toLowerCase();

  if (!lower.includes("<html")) {
    out.push({
      id: "html-no-root",
      severity: "error",
      fileId: "app.html",
      message: "Document HTML incomplet (balise <html> manquante).",
    });
    return out;
  }

  if (!lower.includes("</html>")) {
    out.push({
      id: "html-truncated",
      severity: "error",
      fileId: "app.html",
      message: "HTML tronqué : </html> manquant.",
      line: trimmed.split("\n").length,
    });
  }

  if (!lower.includes("<!doctype")) {
    out.push({
      id: "html-doctype",
      severity: "warning",
      fileId: "app.html",
      message: "Pas de <!DOCTYPE html> — Preview peut être capricieuse.",
      line: 1,
    });
  }

  const scriptsOpen = (trimmed.match(/<script\b/gi) || []).length;
  const scriptsClose = (trimmed.match(/<\/script>/gi) || []).length;
  if (scriptsOpen > scriptsClose) {
    out.push({
      id: "html-script",
      severity: "error",
      fileId: "app.html",
      message: `${scriptsOpen - scriptsClose} balise(s) <script> non fermée(s).`,
      line: lineOf(trimmed, trimmed.toLowerCase().lastIndexOf("<script")),
    });
  }

  const stylesOpen = (trimmed.match(/<style\b/gi) || []).length;
  const stylesClose = (trimmed.match(/<\/style>/gi) || []).length;
  if (stylesOpen > stylesClose) {
    out.push({
      id: "html-style",
      severity: "error",
      fileId: "app.html",
      message: `${stylesOpen - stylesClose} balise(s) <style> non fermée(s).`,
    });
  }

  if (/src\s*=\s*["']\s*["']/i.test(trimmed) || /src\s*=\s*["']#["']/i.test(trimmed)) {
    out.push({
      id: "html-empty-src",
      severity: "warning",
      fileId: "app.html",
      message: "Image avec src vide — utilise une URL Pollinations ou retire la balise.",
    });
  }

  if (trimmed.length < 350) {
    out.push({
      id: "html-short",
      severity: "warning",
      fileId: "app.html",
      message: "HTML très court — la Preview risque d’être trop minimaliste.",
    });
  }

  return out;
}

function analyzeSql(sql: string): StudioProblem[] {
  const out: StudioProblem[] = [];
  const trimmed = sql.trim();
  if (!trimmed) return out;

  if (trimmed.length < 30) {
    out.push({
      id: "sql-short",
      severity: "warning",
      fileId: "schema.sql",
      message: "Schéma SQL très court.",
    });
  }

  if (/create\s+table/i.test(trimmed) && !/;/.test(trimmed)) {
    out.push({
      id: "sql-nosemi",
      severity: "warning",
      fileId: "schema.sql",
      message: "CREATE TABLE sans point-virgule — vérifie la fin des statements.",
    });
  }

  // Unbalanced quotes (simple heuristic)
  const singles = (trimmed.match(/'/g) || []).length;
  if (singles % 2 === 1) {
    out.push({
      id: "sql-quote",
      severity: "error",
      fileId: "schema.sql",
      message: "Guillemet simple non fermé dans le SQL.",
    });
  }

  return out;
}

function analyzeTsLike(
  content: string,
  fileId: StudioFileId,
  label: string,
): StudioProblem[] {
  const out: StudioProblem[] = [];
  const trimmed = content.trim();
  if (!trimmed) return out;

  if (trimmed.length < 40) {
    out.push({
      id: `${fileId}-short`,
      severity: "warning",
      fileId,
      message: `${label} trop court (stub quasi vide).`,
    });
  }

  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    out.push({
      id: `${fileId}-braces`,
      severity: "error",
      fileId,
      message: `${label} : accolades déséquilibrées ({ ${openBraces} / } ${closeBraces}).`,
    });
  }

  const openParen = (trimmed.match(/\(/g) || []).length;
  const closeParen = (trimmed.match(/\)/g) || []).length;
  if (Math.abs(openParen - closeParen) > 2) {
    out.push({
      id: `${fileId}-parens`,
      severity: "warning",
      fileId,
      message: `${label} : parenthèses probablement déséquilibrées.`,
    });
  }

  return out;
}

export type StudioProblemSnap = {
  html?: string | null;
  react?: string | null;
  nextjs?: string | null;
  sql?: string | null;
  api?: string | null;
  pendingFileIds?: StudioFileId[];
};

export function analyzeStudioProblems(snap: StudioProblemSnap): StudioProblem[] {
  const problems: StudioProblem[] = [];

  problems.push(...analyzeHtml(snap.html || ""));
  problems.push(...analyzeSql(snap.sql || ""));
  problems.push(...analyzeTsLike(snap.react || "", "App.tsx", "App.tsx"));
  problems.push(...analyzeTsLike(snap.nextjs || "", "app/page.tsx", "app/page.tsx"));
  problems.push(...analyzeTsLike(snap.api || "", "api.ts", "api.ts"));

  const hasHtml = Boolean(snap.html?.trim());
  const hasSql = Boolean(snap.sql?.trim());
  const hasApi = Boolean(snap.api?.trim());

  if (hasHtml && hasSql && !hasApi) {
    problems.push({
      id: "api-missing",
      severity: "info",
      fileId: "api.ts",
      message: "SQL présent mais pas d’API — demande à l’Agent d’aligner api.ts.",
    });
  }

  if (hasHtml && !hasSql && /supabase|postgres|base de donn/i.test(snap.html || "")) {
    problems.push({
      id: "sql-missing",
      severity: "info",
      fileId: "schema.sql",
      message: "L’UI parle de données mais schema.sql est vide.",
    });
  }

  for (const fileId of snap.pendingFileIds || []) {
    problems.push({
      id: `pending-${fileId}`,
      severity: "info",
      fileId,
      message: `Diff Agent en attente — Accepte ou Refuse (${fileId}).`,
    });
  }

  const order: Record<StudioProblemSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return problems.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function countStudioProblemBadge(problems: StudioProblem[]) {
  return problems.filter((p) => p.severity === "error" || p.severity === "warning")
    .length;
}

/** Prompt Agent pour corriger un problème détecté. */
export function buildProblemFixPrompt(problem: StudioProblem): string {
  const line = problem.line ? ` (vers la ligne ${problem.line})` : "";
  return `Corrige ce problème dans ${problem.fileId}${line} — ne réécris pas tout le projet, applique un fix minimal et cohérent avec le workspace.

Problème [${problem.severity}]: ${problem.message}

Règles:
- Retourne le fichier complet corrigé (ou JSON multi-fichiers si SQL/API/HTML doivent rester alignés).
- Ne casse pas les autres écrans / tables déjà présents.
- Si le HTML est tronqué, termine proprement jusqu’à </html>.`;
}

/** Prompt pour corriger plusieurs erreurs d’un coup. */
export function buildMultiProblemFixPrompt(problems: StudioProblem[]): string {
  const list = problems
    .filter((p) => !p.id.startsWith("pending-"))
    .slice(0, 8)
    .map(
      (p) =>
        `- ${p.fileId}${p.line ? `:${p.line}` : ""} [${p.severity}] ${p.message}`,
    )
    .join("\n");

  return `Corrige ces problèmes Okapi Studio. Priorité aux erreurs. Garde le produit intact, fixes minimaux, cohérence multi-fichiers si besoin.

Problèmes:
${list}

Réponds en multi-fichiers JSON si plusieurs fichiers sont touchés, sinon le fichier actif corrigé.`;
}
