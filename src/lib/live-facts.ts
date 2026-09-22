/**
 * Faits officiels RDC — source = Supabase (MCP Claude / SQL Editor).
 * Chemin chaud : lecture DB uniquement (beaucoup de demandes → pas de scrape .gouv.cd).
 * Jamais le LLM pour inventer un nom.
 *
 * Table: public.official_office_facts
 * Migration: supabase/migrations/20260320_official_office_facts.sql
 */

import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

type OfficialSource = {
  match: RegExp;
  label: string;
  urls: string[];
  /** Secours local si la table Supabase n’est pas encore migrée. */
  curated?: { name: string; role: string; asOf: string; interim?: boolean };
};

type DbOfficeFact = {
  province: string;
  role: string;
  holder_name: string;
  interim: boolean;
  source_url: string | null;
  as_of: string;
  match_keywords: string[] | null;
};

/** Secours code seulement si Supabase vide / migration pas encore jouée. */
const GOVERNOR_FALLBACKS: OfficialSource[] = [
  {
    match: /\b(haut[- ]?katanga|lubumbashi)\b/i,
    label: "Haut-Katanga",
    urls: ["https://haut-katanga.gouv.cd/le-gouverneur/"],
    curated: {
      name: "Martin Kazembe Shula",
      role: "gouverneur intérimaire",
      asOf: "2026-09",
      interim: true,
    },
  },
  {
    match: /\b(lualaba|kolwezi)\b/i,
    label: "Lualaba",
    urls: ["https://www.provincelualaba.cd/"],
    curated: {
      name: "Fifi Masuka Saini",
      role: "gouverneure",
      asOf: "2026-09",
      interim: false,
    },
  },
];

export type LiveFactPacket = {
  ok: boolean;
  province?: string;
  sourceUrl?: string;
  name?: string;
  excerpt?: string;
  curated?: boolean;
  note: string;
};

function normalizeAsk(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\bgourveneur(e)?s?\b/g, "gouverneur")
    .replace(/\bgouvernor(e)?s?\b/g, "gouverneur")
    .replace(/\bgovernor(e)?s?\b/g, "gouverneur");
}

/** Lecture rapide Supabase — 1 requête, pas d’appel externe. */
async function resolveFromSupabase(
  message: string,
): Promise<LiveFactPacket | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("official_office_facts")
      .select(
        "province, role, holder_name, interim, source_url, as_of, match_keywords",
      )
      .eq("active", true)
      .limit(80);
    if (error || !data?.length) return null;

    const norm = normalizeAsk(message);
    const row = (data as DbOfficeFact[]).find((f) => {
      const keys = f.match_keywords || [];
      return keys.some((k) => {
        const key = k
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "");
        return key.length >= 3 && norm.includes(key);
      });
    });
    if (!row?.holder_name?.trim()) return null;

    const asOf =
      typeof row.as_of === "string" ? row.as_of.slice(0, 7) : "récent";
    const url = row.source_url || "le site officiel de la province";
    return {
      ok: true,
      curated: true,
      province: row.province,
      sourceUrl: row.source_url || undefined,
      name: row.holder_name.trim(),
      note: `Snapshot Supabase Okapi (${asOf}): ${row.holder_name.trim()}, ${row.role} du ${row.province}. À confirmer sur ${url}.`,
    };
  } catch {
    return null;
  }
}

/**
 * Qui est le gouverneur… ?
 * 1) Supabase (source de vérité, scale)
 * 2) snapshot code (si migration pas encore jouée)
 * Pas de scrape .gouv.cd sur le chemin utilisateur.
 */
export async function resolveLiveOfficeFact(
  message: string,
): Promise<LiveFactPacket | null> {
  const m = normalizeAsk(message);
  const isGovernorAsk =
    /\bgouverneur\b/.test(m) ||
    /\bvice[- ]?gouverneur\b/.test(m) ||
    /\bgouvernement provincial\b/.test(m);
  if (!isGovernorAsk) return null;

  const fromDb = await resolveFromSupabase(message);
  if (fromDb) return fromDb;

  const source = GOVERNOR_FALLBACKS.find((s) => s.match.test(message));
  if (source?.curated) {
    return {
      ok: true,
      curated: true,
      province: source.label,
      sourceUrl: source.urls[0],
      name: source.curated.name,
      note: `Snapshot Okapi (${source.curated.asOf}): ${source.curated.name}, ${source.curated.role} du ${source.label}. À confirmer sur ${source.urls[0]}.`,
    };
  }

  return {
    ok: false,
    province: source?.label,
    note: "Province non présente dans official_office_facts. Orienter vers Radio Okapi / Actualite.cd / site .gouv.cd — ne pas inventer un nom.",
  };
}

/** Bloc système (legacy — le chat répond en direct sans LLM). */
export function liveFactSystemBlock(packet: LiveFactPacket): string {
  if (packet.ok && packet.name) {
    return `

VERIFIED LIVE FACT (Supabase / curated — not LLM):
- Province: ${packet.province || "?"}
- Office-holder: ${packet.name}
- Source URL: ${packet.sourceUrl || "n/a"}
- Note: ${packet.note}
Answer clearly with this name in French. Cite the URL. End with « Okapi peut se tromper — vérifie les infos importantes ».`;
  }

  return `

LIVE FACT CHECK FAILED:
${packet.note}
FORBIDDEN: inventing any person’s name as current office-holder.
Tell the user you could not confirm and point to the provincial .gouv.cd site and Radio Okapi.`;
}

/**
 * Réponse figée (sans LLM) quand le nom est connu — évite les hallucinations.
 */
export function formatVerifiedOfficeAnswer(packet: LiveFactPacket): string | null {
  if (!packet.ok || !packet.name || !packet.province) return null;
  const url = packet.sourceUrl || "le site officiel de la province";
  const roleFromNote = packet.note.match(
    /,\s*((?:gouverneur|gouverneure)(?:\s+intérimaire)?)\s+du/i,
  )?.[1];
  const roleFinal = roleFromNote || "gouverneur";
  return [
    `Selon les sources Okapi, le/la ${roleFinal} du ${packet.province} est **${packet.name}**.`,
    `Cette info vient de la base Okapi (à confirmer sur ${url}).`,
    `Okapi peut se tromper — vérifie les infos importantes.`,
  ].join("\n\n");
}

/** Réponse sûre sans LLM — jamais de nom inventé. */
export function formatUnverifiedOfficeAnswer(message: string): string {
  const m = message.toLowerCase();
  let hint =
    "Consulte le site officiel de la province (.gouv.cd) ou Radio Okapi.";
  if (/\blualaba|kolwezi\b/i.test(m)) {
    hint = "Consulte https://www.provincelualaba.cd/ ou Radio Okapi.";
  } else if (/\bhaut[- ]?katanga|lubumbashi\b/i.test(m)) {
    hint = "Consulte https://haut-katanga.gouv.cd/le-gouverneur/ ou Radio Okapi.";
  }
  return [
    `Je ne peux pas confirmer de façon fiable le nom du gouverneur / de la gouverneure demandé(e) à cet instant — Okapi refuse d’inventer un nom.`,
    hint,
    `Okapi peut se tromper — vérifie les infos importantes.`,
  ].join("\n\n");
}
