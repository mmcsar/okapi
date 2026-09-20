/**
 * Ancrage recherche — sources publiques pour réponses exactes (Conseiller).
 * Pas d’invention : le modèle doit s’appuyer sur le contexte injecté.
 */

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
    `&limit=1&namespace=0&format=json&origin=*`;
  const search = (await fetchJson(searchUrl)) as
    | [string, string[], string[], string[]]
    | null;
  const title = search?.[1]?.[0];
  const pageUrl = search?.[3]?.[0];
  if (!title) return [] as ResearchPacket["snippets"];

  const sumUrl = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const sum = (await fetchJson(sumUrl)) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  } | null;
  if (!sum?.extract?.trim()) return [];
  return [
    {
      title: sum.title || title,
      text: sum.extract.trim().slice(0, 1800),
      url: sum.content_urls?.desktop?.page || pageUrl,
    },
  ];
}

/** Questions de recherche / faits (pas rédaction créative pure). */
export function wantsResearchGrounding(message: string): boolean {
  const m = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
  if (m.length < 8) return false;
  // Rédaction pure → pas besoin de grounding web
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
    ) || /\b(rdc|congo|kinshasa|katanga|lubumbashi|goma|bukavu)\b/.test(m)
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

  const [ddg, wiki] = await Promise.all([
    fromDuckDuckGo(query),
    fromWikipediaFr(query),
  ]);

  const seen = new Set<string>();
  const snippets: ResearchPacket["snippets"] = [];
  for (const s of [...ddg, ...wiki]) {
    const key = s.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(s);
    if (snippets.length >= 5) break;
  }

  if (!snippets.length) {
    return {
      ok: false,
      query,
      snippets: [],
      note: "Aucune source publique n’a répondu. Ne pas inventer : dire clairement l’incertitude et proposer de vérifier.",
    };
  }

  return {
    ok: true,
    query,
    snippets,
    note: "Sources publiques récupérées — s’appuyer uniquement sur ces extraits pour les faits.",
  };
}

/** Bloc système pour /api/chat. */
export function researchGroundingSystemBlock(packet: ResearchPacket): string {
  if (!packet.ok || !packet.snippets.length) {
    return `

RESEARCH GROUNDING: no reliable public source found for « ${packet.query} ».
HARD RULE: do NOT invent facts, dates, names, numbers, or news.
Say you cannot confirm from a reliable source right now; invite verification.
End with: « Okapi peut se tromper — vérifie les infos importantes ».`;
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
- For facts/numbers/names/dates: use only the excerpts above. If missing, say « je ne peux pas confirmer ».
- You may explain/structure in clear French, but do not add unverified facts.
- Cite 1–2 source URLs when present.
- Never invent. End once with: « Okapi peut se tromper — vérifie les infos importantes ».`;
}
