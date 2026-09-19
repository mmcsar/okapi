/** Fullstack generation helpers — HTML + SQL + API + optional React/Next. */

export type GenerateMode = "html" | "fullstack";

export type OkapiGenerateArtifacts = {
  html: string;
  react: string | null;
  reactNative: string | null;
  nextjs: string | null;
  sql: string | null;
  api: string | null;
  readme: string | null;
};

/** @deprecated Use OkapiGenerateArtifacts — kept as alias for generate route. */
export type OkapiArtifacts = OkapiGenerateArtifacts;

const FULLSTACK_RE =
  /\b(fullstack|full[\s-]?stack|backend|back[\s-]?end|supabase|postgres|postgresql|base de donn[eé]es|bdd|schema sql|rls|crud|api rest|auth|authentification|login|inscription|serveur|endpoint|table sql|migration)\b/i;

const LARGE_PROJECT_RE =
  /\b(grand projet|gros projet|projet complet|plateforme|saas|crm|erp|dashboard|tableau de bord|marketplace|ecommerce|e-commerce|multi[- ]?page|plusieurs pages|module|modules|admin panel|back[- ]?office|gestion (des |de |d')?(clients|stocks|ventes|rh|employ[eé]s|ecole|[eé]cole|hopital|h[oô]pital|clinique|flotte|boutique|restaurant|pharmacie)|systeme de|syst[eè]me de|mini[- ]?erp|pos|caisse)\b/i;

const STUDIO_SCAFFOLD_RE =
  /\b(projet complet|grand projet|gros projet|scaffold|g[eé]n[eè]re(r)? (tout|le projet|une? app|un site)|cr[eé]e(r)? (un |une )?(projet|app|application|site|plateforme|crm|saas|dashboard|boutique)|build (a |an |the )?full|fais[- ]moi (un |une )?(projet|crm|saas|dashboard|plateforme|boutique|app)|nouveau projet|from scratch|parti de z[eé]ro)\b/i;

const STUDIO_EDIT_ONLY_RE =
  /\b(change|modifie|corrige|renomme|ajoute (un |une )?(bouton|couleur|titre|texte|style)|fixe|fix|supprime (la |le |l')?ligne|refactor (ce|cette)|dans ce fichier|seulement (le |la |l')?)\b/i;

/** User clearly asks for backend / DB. */
export function wantsFullstack(message: string): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return FULLSTACK_RE.test(m) || wantsLargeProject(message);
}

/** Ambitious / multi-module product — both Flash and Pro can build. */
export function wantsLargeProject(message: string): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return LARGE_PROJECT_RE.test(m);
}

/**
 * Studio Agent should scaffold a multi-file project (not a single-file tweak).
 * Empty workspace → almost always full project, unless clearly an edit.
 */
export function wantsStudioScaffold(
  message: string,
  opts?: { hasExistingFiles?: boolean },
): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (wantsLargeProject(message)) return true;
  if (STUDIO_SCAFFOLD_RE.test(m)) return true;
  if (!opts?.hasExistingFiles) {
    // Workspace vide : toute demande substantielle = projet complet
    if (STUDIO_EDIT_ONLY_RE.test(m) && m.length < 80) return false;
    if (
      /\b(cr[eé]e|creer|fais|g[eé]n[eè]re|build|construire|lance|d[eé]marre).{0,64}\b(app|site|projet|crm|saas|boutique|[eé]cole|clinique|dashboard|plateforme|page|landing)\b/i.test(
        m,
      )
    ) {
      return true;
    }
    // Ex: « boutique mode Kinshasa avec panier » sans verbe explicite
    if (m.trim().length >= 18 && !STUDIO_EDIT_ONLY_RE.test(m)) {
      return /\b(app|site|projet|crm|saas|boutique|[eé]cole|clinique|dashboard|plateforme|landing|vitrine|portfolio|restaurant|pharmacie|flotte)\b/i.test(
        m,
      );
    }
  }
  return false;
}

export function resolveGenerateMode(
  message: string,
  explicit?: string | null,
): GenerateMode {
  const mode = (explicit || "auto").toLowerCase().trim();
  if (mode === "fullstack" || mode === "full") return "fullstack";
  if (mode === "html" || mode === "front" || mode === "frontend") return "html";
  return wantsFullstack(message) ? "fullstack" : "html";
}

const MARKER_ORDER = [
  "HTML",
  "REACT",
  "RN",
  "NEXT",
  "SQL",
  "API",
  "README",
  "END",
] as const;

function marker(name: string) {
  return `===OKAPI_${name}===`;
}

function sliceBetween(raw: string, start: string, endMarkers: string[]) {
  const from = raw.indexOf(start);
  if (from < 0) return null;
  const bodyStart = from + start.length;
  let end = raw.length;
  for (const em of endMarkers) {
    const i = raw.indexOf(em, bodyStart);
    if (i >= 0 && i < end) end = i;
  }
  return raw.slice(bodyStart, end).trim();
}

function endsAfter(name: (typeof MARKER_ORDER)[number]) {
  const i = MARKER_ORDER.indexOf(name);
  return MARKER_ORDER.slice(i + 1).map((n) => marker(n));
}

function fence(raw: string, lang: string) {
  const re = new RegExp("```(?:" + lang + ")?\\s*([\\s\\S]*?)```", "i");
  const m = raw.match(re);
  return m?.[1]?.trim() || null;
}

function nonEmpty(s: string | null, min = 20): string | null {
  if (!s || s.length < min) return null;
  return s;
}

/** Close truncated HTML so the Preview iframe still renders. */
export function ensureHtmlDocument(html: string) {
  let out = html.trim();
  if (!out) return out;
  const lower = out.toLowerCase();
  if (!lower.includes("<html")) return out;
  if (!lower.includes("</body>")) out += "\n</body>";
  if (!out.toLowerCase().includes("</html>")) out += "\n</html>";
  return out;
}

export function extractHtmlDocument(text: string) {
  const trimmed = text.trim();
  const fenceHtml = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenceHtml?.[1]?.toLowerCase().includes("<html")) {
    return ensureHtmlDocument(fenceHtml[1]);
  }
  const doc = trimmed.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (doc?.[0]) return doc[0].trim();
  if (trimmed.includes("<html")) {
    const start = trimmed.indexOf("<!DOCTYPE");
    const alt = trimmed.indexOf("<html");
    const from = start >= 0 ? start : alt;
    if (from >= 0) {
      const end = trimmed.toLowerCase().lastIndexOf("</html>");
      if (end > from) return trimmed.slice(from, end + 7).trim();
      return ensureHtmlDocument(trimmed.slice(from));
    }
  }
  return trimmed;
}

/**
 * Parse Okapi delimiter blocks (HTML + optional React/Next/SQL/API/README).
 */
export function parseOkapiArtifacts(raw: string): OkapiGenerateArtifacts {
  const text = raw.trim();
  const hasMarkers =
    /===OKAPI_(HTML|REACT|RN|NEXT|SQL|API|README)===/i.test(text);

  if (hasMarkers) {
    const htmlRaw =
      sliceBetween(text, marker("HTML"), endsAfter("HTML")) || "";
    const react = sliceBetween(text, marker("REACT"), endsAfter("REACT"));
    const reactNative = sliceBetween(text, marker("RN"), endsAfter("RN"));
    const nextjs = sliceBetween(text, marker("NEXT"), endsAfter("NEXT"));
    const sql = sliceBetween(text, marker("SQL"), endsAfter("SQL"));
    const api = sliceBetween(text, marker("API"), endsAfter("API"));
    const readme = sliceBetween(text, marker("README"), endsAfter("README"));

    return {
      html: extractHtmlDocument(htmlRaw),
      react: nonEmpty(react, 40),
      reactNative: nonEmpty(reactNative, 40),
      nextjs: nonEmpty(nextjs, 40),
      sql: nonEmpty(sql, 20),
      api: nonEmpty(api, 20),
      readme: nonEmpty(readme, 10),
    };
  }

  // Fallback: fenced blocks without Okapi markers
  const html = extractHtmlDocument(text);
  const sql =
    fence(text, "sql") ||
    (text.match(/--\s*Okapi[\s\S]{40,}/i)?.[0] ?? null);
  const api =
    fence(text, "typescript") ||
    fence(text, "ts") ||
    fence(text, "javascript") ||
    fence(text, "js");
  const tsx = fence(text, "tsx") || fence(text, "jsx");

  return {
    html,
    react: tsx && !tsx.includes("<html") ? nonEmpty(tsx, 40) : null,
    reactNative: null,
    nextjs: null,
    sql: sql && !sql.includes("<html") ? sql : null,
    api: api && !api.includes("<html") ? api : null,
    readme: null,
  };
}

export function titleFromHtml(html: string, fallback: string) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return titleMatch?.[1]?.trim() || fallback;
}
