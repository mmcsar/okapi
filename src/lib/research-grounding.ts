/**
 * Ancrage recherche — sources publiques pour réponses exactes (Conseiller).
 * Priorité RDC : Wikipedia FR + DuckDuckGo + fil Radio Okapi (RSS).
 * Pas d’invention : le modèle doit s’appuyer sur le contexte injecté.
 */

import { honestyClosing } from "@/lib/i18n";

export type ResearchPacket = {
  ok: boolean;
  query: string;
  snippets: { title: string; text: string; url?: string }[];
  note: string;
};

function cleanQuery(q: string) {
  return q
    .trim()
    .replace(/^(okapi[,:]?\s*)/i, "")
    .replace(/^(s['’]il te pla[iî]t[,:]?\s*)/i, "")
    .slice(0, 200);
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

function isRdcTopic(message: string) {
  return /\b(rdc|congo|kinshasa|katanga|haut[- ]?katanga|lualaba|lubumbashi|goma|bukavu|kisangani|mbuji[- ]?mayi|kolwezi|matadi|kananga|bandundu|ituri|nord[- ]?kivu|sud[- ]?kivu|kasai|congola|congolais)\b/i.test(
    normalize(message),
  );
}

function wantsNews(message: string) {
  return /\b(dernieres? nouvelles?|actu(alite)?s?|ce qui se passe|breaking|aujourd hui|en ce moment)\b/i.test(
    normalize(message),
  );
}

/** Oriente la requête vers le contexte RDC sans inventer de faits. */
function shapeQuery(query: string) {
  const n = normalize(query);
  if (isRdcTopic(query)) {
    if (!/\b(rdc|republique democratique|congo)\b/.test(n)) {
      return `${query} RDC`;
    }
  }
  return query;
}

async function fetchText(
  url: string,
  timeoutMs = 7_000,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "OkapiBot/1.0 (+https://okapi-elf9.vercel.app; research)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  timeoutMs = 6_000,
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "User-Agent": "OkapiBot/1.0 (+https://okapi-elf9.vercel.app; research)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function stripXml(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fromDuckDuckGo(query: string) {
  const url =
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}` +
    `&format=json&no_html=1&no_redirect=1&skip_disambig=1&t=okapi`;
  const data = (await fetchJson(url)) as {
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Heading?: string;
    Answer?: string | { result?: string };
    Definition?: string;
    DefinitionURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | string>;
  } | null;
  if (!data) return [] as ResearchPacket["snippets"];

  const out: ResearchPacket["snippets"] = [];
  const answer =
    typeof data.Answer === "string"
      ? data.Answer
      : data.Answer && typeof data.Answer === "object"
        ? ""
        : "";
  if (answer.trim()) {
    out.push({
      title: data.Heading || "Réponse courte",
      text: answer.trim().slice(0, 1200),
      url: data.AbstractURL,
    });
  }
  if (data.AbstractText?.trim()) {
    out.push({
      title: data.Heading || data.AbstractSource || "Résumé",
      text: data.AbstractText.trim().slice(0, 1800),
      url: data.AbstractURL,
    });
  }
  if (data.Definition?.trim()) {
    out.push({
      title: "Définition",
      text: data.Definition.trim().slice(0, 800),
      url: data.DefinitionURL,
    });
  }
  for (const rel of data.RelatedTopics || []) {
    if (out.length >= 4) break;
    if (!rel || typeof rel === "string") continue;
    if (rel.Text?.trim()) {
      out.push({
        title: "Sujet lié",
        text: rel.Text.trim().slice(0, 400),
        url: rel.FirstURL,
      });
    }
  }
  return out;
}

async function fromWikipediaFr(query: string) {
  const searchUrl =
    `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}` +
    `&limit=2&namespace=0&format=json&origin=*`;
  const search = (await fetchJson(searchUrl)) as
    | [string, string[], string[], string[]]
    | null;
  const titles = search?.[1] || [];
  const pageUrls = search?.[3] || [];
  if (!titles.length) return [] as ResearchPacket["snippets"];

  const out: ResearchPacket["snippets"] = [];
  for (let i = 0; i < Math.min(titles.length, 2); i++) {
    const title = titles[i];
    const pageUrl = pageUrls[i];
    const sumUrl = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sum = (await fetchJson(sumUrl)) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    } | null;
    if (!sum?.extract?.trim()) continue;
    out.push({
      title: sum.title || title,
      text: sum.extract.trim().slice(0, 1800),
      url: sum.content_urls?.desktop?.page || pageUrl,
    });
  }
  return out;
}

/** Fil actualité RDC — titres récents, filtrés par mots de la question. */
async function fromRadioOkapiRss(query: string) {
  const xml = await fetchText(
    "https://feeds.feedburner.com/radiookapi/actu?format=xml",
  );
  if (!xml) return [] as ResearchPacket["snippets"];

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 40);
  const tokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
    .slice(0, 8);

  const scored: { score: number; snip: ResearchPacket["snippets"][0] }[] = [];
  for (const m of items) {
    const block = m[1] || "";
    const title = stripXml(
      block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "",
    );
    const link = stripXml(
      block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "",
    );
    const desc = stripXml(
      block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "",
    );
    if (!title) continue;
    const hay = normalize(`${title} ${desc}`);
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }
    // Actualité générale RDC : garder quelques titres même sans match fort
    if (score === 0 && wantsNews(query)) score = 0.2;
    if (score <= 0) continue;
    scored.push({
      score,
      snip: {
        title: `Radio Okapi — ${title}`,
        text: (desc || title).slice(0, 900),
        url: link || "https://www.radiookapi.net/",
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.snip);
}

/** Questions de recherche / faits (pas rédaction créative pure). */
export function wantsResearchGrounding(message: string): boolean {
  const m = normalize(message);
  if (m.length < 8) return false;
  if (
    /\b(redige|ecris|ecrire|draft|poste linkedin|script|discours|lettre|poeme|slogan)\b/.test(
      m,
    ) &&
    !/\b(qui|quel|quelle|combien|quand|ou|c est quoi|quest ce|recherche|renseigne)\b/.test(
      m,
    )
  ) {
    return false;
  }
  return (
    /\b(qui|quel|quelle|quels|quelles|combien|quand|ou|pourquoi|comment|c est quoi|quest[- ]ce|explique|recherche|renseigne|inform|difference|defini|definition|histoire de|capitale|population|superficie)\b/.test(
      m,
    ) ||
    isRdcTopic(message) ||
    wantsNews(message)
  );
}

/**
 * Récupère des extraits sources pour ancrer la réponse Conseiller.
 */
export async function resolveResearchGrounding(
  message: string,
): Promise<ResearchPacket | null> {
  if (!wantsResearchGrounding(message)) return null;
  const query = cleanQuery(message);
  if (query.length < 3) return null;

  const shaped = shapeQuery(query);
  const rdcOrNews = isRdcTopic(message) || wantsNews(message);

  const [ddg, wiki, radio] = await Promise.all([
    fromDuckDuckGo(shaped),
    fromWikipediaFr(shaped),
    rdcOrNews ? fromRadioOkapiRss(query) : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const snippets: ResearchPacket["snippets"] = [];
  // Radio Okapi d’abord pour l’actu RDC
  for (const s of [...radio, ...wiki, ...ddg]) {
    const key = s.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(s);
    if (snippets.length >= 6) break;
  }

  if (!snippets.length) {
    return {
      ok: false,
      query: shaped,
      snippets: [],
      note: "Aucune source publique n’a répondu. Ne pas inventer : dire clairement l’incertitude et proposer Radio Okapi / Actualite.cd / sites .gouv.cd.",
    };
  }

  return {
    ok: true,
    query: shaped,
    snippets,
    note: "Sources publiques (Wikipedia / DuckDuckGo / Radio Okapi) — s’appuyer uniquement sur ces extraits pour les faits.",
  };
}

/** Bloc système pour /api/chat. */
export function researchGroundingSystemBlock(
  packet: ResearchPacket,
  language?: string | null,
): string {
  const closing = honestyClosing(language);
  if (!packet.ok || !packet.snippets.length) {
    return `

RESEARCH GROUNDING: no reliable public source found for « ${packet.query} ».
HARD RULE: do NOT invent facts, dates, names, numbers, or news.
Say you cannot confirm from a reliable source right now; invite verification on Radio Okapi, Actualite.cd or official .gouv.cd sites.
Reply in the user’s language. End with: « ${closing} ».`;
  }

  const lines = packet.snippets
    .map((s, i) => {
      const u = s.url ? ` (${s.url})` : "";
      return `[${i + 1}] ${s.title}${u}\n${s.text}`;
    })
    .join("\n\n");

  return `

RESEARCH GROUNDING (verified public excerpts — answer from THESE only for factual claims):
Query: ${packet.query}
${lines}

RULES:
- For facts/numbers/names/dates: use only the excerpts above. If missing, say you cannot confirm.
- Explain in the user’s preferred language (see LANGUAGE). Do not force French if they use Lingala, Swahili, or English.
- Cite 1–2 source URLs when present (prefer Radio Okapi / Wikipedia when relevant).
- Never invent. End once with: « ${closing} ».`;
}
