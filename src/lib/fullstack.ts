/** Fullstack generation helpers — HTML + Supabase SQL + API stubs. */

export type GenerateMode = "html" | "fullstack";

export type OkapiArtifacts = {
  html: string;
  sql: string | null;
  api: string | null;
  readme: string | null;
};

const FULLSTACK_RE =
  /\b(fullstack|full[\s-]?stack|backend|back[\s-]?end|supabase|postgres|postgresql|base de donn[eé]es|bdd|schema sql|rls|crud|api rest|auth|authentification|login|inscription|serveur|endpoint|table sql|migration)\b/i;

const LARGE_PROJECT_RE =
  /\b(grand projet|gros projet|projet complet|plateforme|saas|crm|erp|dashboard|tableau de bord|marketplace|ecommerce|e-commerce|multi[- ]?page|plusieurs pages|module|modules|admin panel|back[- ]?office|gestion (des |de |d')?(clients|stocks|ventes|rh|employes|ecole|hopital|clinique|flotte)|systeme de|syst[eè]me de)\b/i;

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

export function resolveGenerateMode(
  message: string,
  explicit?: string | null,
): GenerateMode {
  const mode = (explicit || "auto").toLowerCase().trim();
  if (mode === "fullstack" || mode === "full") return "fullstack";
  if (mode === "html" || mode === "front" || mode === "frontend") return "html";
  return wantsFullstack(message) ? "fullstack" : "html";
}

function sliceBetween(raw: string, start: string, endMarkers: string[]) {
  const from = raw.indexOf(start);
  if (from < 0) return null;
  const bodyStart = from + start.length;
  let end = raw.length;
  for (const marker of endMarkers) {
    const i = raw.indexOf(marker, bodyStart);
    if (i >= 0 && i < end) end = i;
  }
  return raw.slice(bodyStart, end).trim();
}

function fence(raw: string, lang: string) {
  const re = new RegExp(
    "```(?:" + lang + ")?\\s*([\\s\\S]*?)```",
    "i",
  );
  const m = raw.match(re);
  return m?.[1]?.trim() || null;
}

export function extractHtmlDocument(text: string) {
  const trimmed = text.trim();
  const fenceHtml = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenceHtml?.[1]?.toLowerCase().includes("<html")) {
    return fenceHtml[1].trim();
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
      return trimmed.slice(from).trim();
    }
  }
  return trimmed;
}

/**
 * Parse Okapi delimiter blocks, or fall back to HTML-only extraction.
 */
export function parseOkapiArtifacts(raw: string): OkapiArtifacts {
  const text = raw.trim();
  const hasMarkers = /===OKAPI_(HTML|SQL|API|README)===/i.test(text);

  if (hasMarkers) {
    const htmlRaw =
      sliceBetween(text, "===OKAPI_HTML===", [
        "===OKAPI_SQL===",
        "===OKAPI_API===",
        "===OKAPI_README===",
        "===OKAPI_END===",
      ]) || "";
    const sql = sliceBetween(text, "===OKAPI_SQL===", [
      "===OKAPI_API===",
      "===OKAPI_README===",
      "===OKAPI_END===",
    ]);
    const api = sliceBetween(text, "===OKAPI_API===", [
      "===OKAPI_README===",
      "===OKAPI_END===",
    ]);
    const readme = sliceBetween(text, "===OKAPI_README===", [
      "===OKAPI_END===",
    ]);

    return {
      html: extractHtmlDocument(htmlRaw),
      sql: sql && sql.length > 20 ? sql : null,
      api: api && api.length > 20 ? api : null,
      readme: readme && readme.length > 10 ? readme : null,
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

  return {
    html,
    sql: sql && !sql.includes("<html") ? sql : null,
    api: api && !api.includes("<html") ? api : null,
    readme: null,
  };
}

export function titleFromHtml(html: string, fallback: string) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return titleMatch?.[1]?.trim() || fallback;
}
