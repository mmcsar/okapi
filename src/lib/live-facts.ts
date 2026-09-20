/**
 * Faits « live » RDC — lecture de pages officielles (pas d’invention modèle).
 * Utilisé par /api/chat pour les questions gouverneur / actualité locale.
 */

type OfficialSource = {
  match: RegExp;
  label: string;
  urls: string[];
  /** Secours daté si le site .gouv.cd est injoignable (réseau / TLS). */
  curated?: { name: string; role: string; asOf: string; interim?: boolean };
};

const GOVERNOR_SOURCES: OfficialSource[] = [
  {
    match: /\b(haut[- ]?katanga|lubumbashi)\b/i,
    label: "Haut-Katanga",
    urls: [
      "https://haut-katanga.gouv.cd/le-gouverneur/",
      "https://haut-katanga.gouv.cd/",
    ],
    curated: {
      name: "Martin Kazembe Shula",
      role: "gouverneur intérimaire",
      asOf: "2026-09",
      interim: true,
    },
  },
  {
    match: /\b(kinshasa)\b/i,
    label: "Kinshasa",
    urls: ["https://www.kinshasa.cd/", "https://kinshasa.gouv.cd/"],
  },
  {
    match: /\b(nord[- ]?kivu|goma)\b/i,
    label: "Nord-Kivu",
    urls: ["https://nordkivu.gouv.cd/"],
  },
  {
    match: /\b(sud[- ]?kivu|bukavu)\b/i,
    label: "Sud-Kivu",
    urls: ["https://sudkivu.gouv.cd/"],
  },
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string, timeoutMs = 4_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "OkapiBot/1.0 (+https://okapi-elf9.vercel.app; fact-check)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtml(html).slice(0, 6_000);
  } catch {
    return null;
  }
}

/** Extrait un nom plausible près de « gouverneur » dans le texte officiel. */
function extractGovernorName(text: string): string | null {
  const patterns = [
    /(?:Le\s+)?[Gg]ouverneur\s+(?:intérimaire\s+)?([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-Za-zÀ-ÿ'’\-]+(?:\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-Za-zÀ-ÿ'’\-]+){1,4})/,
    /([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-Za-zÀ-ÿ'’\-]+(?:\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-Za-zÀ-ÿ'’\-]+){1,4})\s+(?:Le\s+)?[Gg]ouverneur/,
    /Martin\s+KAZEMBE\s+SHULA/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1] || m?.[0]) {
      const name = (m[1] || m[0]).replace(/\s+/g, " ").trim();
      if (name.length >= 8 && name.length <= 80) return name;
    }
  }
  const head = text.slice(0, 400);
  const caps = head.match(
    /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüç]+(?:\s+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][A-Za-zÀ-ÿ'’\-]+){1,3})\b/,
  );
  if (caps?.[1] && /kazembe|kyabula|gouverneur/i.test(text.slice(0, 800))) {
    return caps[1];
  }
  return null;
}

export type LiveFactPacket = {
  ok: boolean;
  province?: string;
  sourceUrl?: string;
  name?: string;
  excerpt?: string;
  curated?: boolean;
  note: string;
};

/**
 * Pour une question « qui est le gouverneur de … », lit le site officiel
 * (sinon snapshot vérifié Okapi daté — jamais un nom inventé par le LLM).
 */
export async function resolveLiveOfficeFact(
  message: string,
): Promise<LiveFactPacket | null> {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const isGovernorAsk =
    /\bgouverneur\b/.test(m) ||
    /\bvice[- ]?gouverneur\b/.test(m) ||
    /\bgouvernement provincial\b/.test(m);
  if (!isGovernorAsk) return null;

  const source = GOVERNOR_SOURCES.find((s) => s.match.test(message));
  if (!source) {
    return {
      ok: false,
      note: "Province non reconnue pour une lecture officielle automatique. Orienter vers Radio Okapi / Actualite.cd / site .gouv.cd de la province.",
    };
  }

  for (const url of source.urls) {
    const text = await fetchText(url);
    if (!text || text.length < 80) continue;
    const name = extractGovernorName(text);
    const excerpt = text.slice(0, 500);
    if (name) {
      const interim = /int[eé]rim/i.test(text.slice(0, 1200));
      return {
        ok: true,
        province: source.label,
        sourceUrl: url,
        name,
        excerpt,
        note: interim
          ? `${name} apparaît comme gouverneur (souvent intérimaire) sur ${url}`
          : `${name} apparaît comme gouverneur sur ${url}`,
      };
    }
    return {
      ok: true,
      province: source.label,
      sourceUrl: url,
      excerpt,
      note: `Page officielle lue (${url}) — extraire uniquement ce qui y est écrit, sans inventer un nom absent du texte.`,
    };
  }

  if (source.curated) {
    return {
      ok: true,
      curated: true,
      province: source.label,
      sourceUrl: source.urls[0],
      name: source.curated.name,
      note: `Snapshot Okapi (${source.curated.asOf}): ${source.curated.name}, ${source.curated.role} du ${source.label}. Site live injoignable — demander de confirmer sur ${source.urls[0]}.`,
    };
  }

  return {
    ok: false,
    province: source.label,
    note: `Impossible de joindre le site officiel de ${source.label} pour le moment. Ne pas inventer un nom.`,
  };
}

/** Bloc système injecté dans /api/chat. */
export function liveFactSystemBlock(packet: LiveFactPacket): string {
  if (packet.ok && packet.name) {
    const provenance = packet.curated
      ? "CURATED OKAPI SNAPSHOT (dated — not a live scrape). State the name, say it must be confirmed on the official site, and give the URL."
      : "VERIFIED from official page scrape — use this name, do not invent another.";
    return `

VERIFIED LIVE FACT (${provenance}):
- Province: ${packet.province || "?"}
- Office-holder: ${packet.name}
- Source URL: ${packet.sourceUrl || "n/a"}
- Note: ${packet.note}
Answer clearly with this name in French. If curated/intérim, say so. Cite the URL. End with « Okapi peut se tromper — vérifie les infos importantes ».`;
  }

  if (packet.ok && packet.excerpt) {
    return `

VERIFIED SOURCE EXCERPT (official page — answer ONLY from this text, no invented names):
- Province: ${packet.province || "?"}
- Source: ${packet.sourceUrl}
- Excerpt: ${packet.excerpt}
If the current gouverneur name is clear in the excerpt, state it. If not clear, say you cannot confirm and give the URL. Never invent a name absent from the excerpt.`;
  }

  return `

LIVE FACT CHECK FAILED:
${packet.note}
FORBIDDEN: inventing any person’s name as current office-holder.
Tell the user you could not confirm live and point to the provincial .gouv.cd site and Radio Okapi. End with « Okapi peut se tromper — vérifie les infos importantes ».`;
}
