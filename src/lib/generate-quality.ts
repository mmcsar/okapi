/** Post-generate quality checks + repair prompts for Okapi builder. */

import type { GenerateMode, OkapiGenerateArtifacts } from "@/lib/fullstack";

export type GenerateQualityIssue = {
  code: string;
  detail: string;
};

const MAX_REPAIR_ATTEMPTS = 2;

/** Codes où un 2e passage (continuer / fermer HTML) vaut le coût. */
const TRUNCATION_REPAIR_CODES = new Set([
  "no_html",
  "truncated_html",
  "unclosed_script",
  "unclosed_style",
]);

/** Barème visuel partagé Preview + Studio. */
export const OKAPI_PRODUCT_DESIGN = `DESIGN — vrai site ou vraie app, pas une maquette:
- Produit cliquable: en-tête avec le nom, navigation vers chaque écran, contenu principal, pied de page ou barre d’app.
- Une palette cohérente avec le métier (vert profond #1b4f3a et ambre #e8892a conviennent). Hiérarchie de titres, espaces larges, boutons clairement cliquables. Jamais une seule carte centrée sur un dégradé violet / indigo.
- Contenu d’exemple spécifique au brief (noms, prix en CDF pour une boutique, Kinshasa ou Gombe si c’est local). Pas de lorem ipsum, pas de TODO.
- Un site a un hero, au moins deux sections de contenu, et une action claire (contact, commande, paiement). Une app a au moins deux écrans (liste + formulaire ou détail) avec une navigation qui change vraiment de vue.
- Photos: https://picsum.photos/seed/MOT_ANGLAIS_UNIQUE/1200/800 — un seed différent par image, 4 images maximum. Jamais image.pollinations.ai, jamais un src vide.
- Listes et formulaires passent par window.Okapi.list/create. États vide, chargement et erreur visibles.`;

/**
 * Sites vitrine / landing — une composition marketing, pas un dashboard.
 * Aligné UX Accueil RDC (marque forte, hero plein, peu de cards).
 */
export const OKAPI_VITRINE_DESIGN = `VITRINE / LANDING (RDC) — non-négociable:
- Première vue = UNE composition: marque (nom) en signal fort + 1 titre + 1 phrase + 1 groupe CTA + 1 image/ambiance dominante. Pas de dashboard, pas de stats, pas de grille de cards dans le hero.
- Hero plein largeur (edge-to-edge), image réelle via picsum.photos/seed/… — pas d’image inset dans une carte arrondie seule.
- Typo expressive (pas Inter / Roboto / Arial). Palette métier claire — éviter purple-on-white et glow violet.
- Sections suivantes (une idée chacune): Services ou Offre · Preuve / galerie · Contact (WhatsApp + téléphone RDC + adresse quartier).
- CTA WhatsApp réaliste (wa.me/243…) si contact commercial. Prix en CDF si tarif affiché.
- Footer simple: nom, ville (Kinshasa / Lubumbashi…), liens. Mobile-first.
- Contenu 100 % inventé mais crédible pour le brief (noms congolais, lieux réels). Zéro lorem ipsum.
- Si c’est une vitrine pure: une page scroll, pas une mini-app multi-écrans. Formulaires contact → window.Okapi.create('leads') ou lien WhatsApp.`;

/**
 * Site vitrine (pas une app métier).
 * « Crée un site » sans boutique / stock / dashboard → page marketing.
 * Une boutique, une école ou un CRM restent des apps.
 */
export function wantsWebsiteBrief(text: string): boolean {
  if (wantsVitrineBrief(text)) {
    const product = stripAccents(text);
    if (
      /\b(app|application|boutique|restaurant|maquis|pharmacie|ecole|clinique|flotte|crm|panier|stock|caisse|dashboard|gestion)\b/.test(
        product,
      )
    ) {
      return false;
    }
    return true;
  }
  const m = stripAccents(text);
  const siteish =
    /\b(site|website|vitrine|landing|portfolio|page web|one page|presentation)\b/.test(
      m,
    );
  const appish =
    /\b(app|application|dashboard|crm|erp|gestion|panier|stock|caisse|saas|plateforme|fullstack|boutique|restaurant|maquis|pharmacie|ecole|clinique|flotte)\b/.test(
      m,
    );
  return siteish && !appish;
}

/** Ce que Preview doit montrer pour un site — app.html d’abord, le reste court. */
export const OKAPI_WEBSITE_CONTRACT = `WEBSITE (app.html is the product — spend the tokens here):
- One scrolling page, not a dashboard and not a multi-screen admin.
- Required in app.html: <header> with the brand, one <h1> hero, one sentence, one CTA (https://wa.me/243… or tel:+243…), one large image https://picsum.photos/seed/UNIQUE_ENGLISH/1400/900, then at least two <section> (offre, preuve or galerie, contact), then <footer> with a real city (Kinshasa, Lubumbashi…).
- Tailwind CDN in <head>. One Google font that is not Inter, Roboto, or Arial (Fraunces, Newsreader, or Outfit).
- Copy is specific and credible (Congolese names, a quartier, CDF if a price is shown). Zero lorem ipsum, zero « Votre titre », zero purple gradient card as the whole page.
- Companion files (App.tsx, app/page.tsx, schema.sql, api.ts, package.json, README.md) stay SHORT — under 40 lines each — so app.html can finish. A contact form may call window.Okapi.create('leads'). Do not invent a catalog CRUD.`;

/** Ce que Preview doit montrer pour une app — navigation qui change vraiment d’écran. */
export const OKAPI_APP_CONTRACT = `APP (app.html must work in Preview without reading the other files):
- Screens and labels come from the brief. Do not rename them to a generic home/list/form app.
- <nav> with buttons data-go="…" for each screen the brief asked for.
- Each screen is <section data-screen="…">. Only the first is visible; the others start with class "hidden".
- A script that toggles them:
  document.querySelectorAll("[data-go]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-go");
      document.querySelectorAll("[data-screen]").forEach(function (s) {
        s.classList.toggle("hidden", s.getAttribute("data-screen") !== id);
      });
    });
  });
- If the brief has a list, that screen shows 2 real sample rows immediately (names, prices in CDF when it is a sale), then refreshes from window.Okapi.list. Empty, loading, and error text are real elements, not comments.
- If the brief has a form, it checks required fields, then Okapi.create, then returns to the list. try/catch shows the error element. list rows are flat { id, name, ... } — never row.data.
- Include the screens the brief asked for. Do not add a different product to reach 3 screens. Tailwind CDN. No single centered card, no lorem, no purple-on-white mock.
- If the JSON must be shorter, shorten README and api.ts. Never cut app.html before </html>.`;

function stripAccents(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

/** Brief = site vitrine / landing / présentation. */
export function wantsVitrineBrief(text: string): boolean {
  const m = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
  return /\b(vitrine|landing|landing page|site vitrine|page vitrine|site presentation|site web (pour |de )?(mon |ma |une? )?(entreprise|asso|association|ecole|eglise|cabinet|agence|marque)|portfolio|showcase|page d accueil (pro|entreprise)|site one[- ]?page)\b/.test(
    m,
  );
}

/**
 * Paiement RDC crédible — sans imposer WhatsApp.
 * À injecter dans Studio / generate / agents métier.
 */
export const OKAPI_MOBILE_MONEY_UX = `PAIEMENT RDC (Mobile Money — obligatoire si vente / abonnement / frais):
- Affiche les prix en CDF (jamais seulement USD).
- Checkout: choix opérateur (M-Pesa, Orange Money, Airtel Money) + champ numéro + montant CDF.
- Instruction claire: « Compose le USSD de ton opérateur » + exemple réaliste (ex. *555# / *144# selon opérateur) + « montant exact » + « référence commande ».
- Après « J’ai payé »: statut « en attente de confirmation » (pas de faux succès instantané).
- Reçu / référence visible. Pas de bouton WhatsApp sauf si l’utilisateur le demande explicitement.`;

export function maxGenerateRepairAttempts() {
  return MAX_REPAIR_ATTEMPTS;
}

/** Soft style issues: 1 pass. Truncation / no_html: jusqu’à 2. */
export function maxRepairAttemptsForIssues(issues: GenerateQualityIssue[]) {
  if (issues.some((i) => TRUNCATION_REPAIR_CODES.has(i.code))) {
    return MAX_REPAIR_ATTEMPTS;
  }
  return 1;
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

  if (html.length < 1800) {
    issues.push({
      code: "too_short",
      detail: "HTML is too short to be a usable website or app. Add navigation, real sections, and sample content.",
    });
  } else if (opts.mode === "fullstack" && html.length < 2400) {
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

  if (/image\.pollinations\.ai|lorem ipsum|titre ici|votre titre/i.test(html)) {
    issues.push({
      code: "weak_page",
      detail:
        "Page uses placeholder copy or a dead image URL. Use real sample content and https://picsum.photos/seed/UNIQUE/1200/800.",
    });
  }

  if (!/<nav\b|<header\b/i.test(html)) {
    issues.push({
      code: "missing_nav",
      detail: "Missing a header or navigation so the product feels like a real site or app.",
    });
  }

  // Vitrine / landing: hero + sections + CTA (détecté par structure HTML)
  const looksLikeMarketingSite =
    /hero|accueil|bienvenue|notre (offre|mission|histoire)|services|contact/i.test(
      html,
    ) && !/window\.Okapi\.(list|create)\s*\(\s*['"]products['"]/i.test(html);
  if (looksLikeMarketingSite) {
    if (
      !/<section\b/i.test(html) ||
      (html.match(/<section\b/gi) || []).length < 2
    ) {
      issues.push({
        code: "vitrine_too_thin",
        detail:
          "Vitrine needs a hero plus at least 2 content sections (offre / galerie / contact).",
      });
    }
    if (
      !/\b(whatsapp|wa\.me|tel:|contactez|commander|demander)\b/i.test(html)
    ) {
      issues.push({
        code: "vitrine_no_cta",
        detail:
          "Vitrine needs a clear CTA (WhatsApp, téléphone, or contact form).",
      });
    }
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
      "weak_page",
      "missing_nav",
      "vitrine_too_thin",
      "vitrine_no_cta",
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
2. Keep the same product as the request. Do not swap it for another métier or a generic template.
3. Prefer completing / closing truncated content over rewriting everything.
4. Always finish completely — never cut off mid-tag.
5. If localStorage was used for lists/forms: replace with window.Okapi.list/create/update/remove. list returns flat rows [{id,...fields}] — never row.data. Empty list → empty state + optional seed create.
6. Make the product more robust: multi-screen nav if missing, empty/loading/error UI, real SQL CREATE TABLE, non-empty React/API stubs.
7. ${formatHint}

Previous (incomplete) output to repair:
${opts.previousRaw.slice(0, 24000)}`;
}
