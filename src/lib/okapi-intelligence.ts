import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectIntelRow = {
  id: string;
  title: string;
  sector: string | null;
  summary: string | null;
  updated_at: string;
  is_public?: boolean | null;
};

/** Mémoire métier Okapi — contexte réel pour Agent / Automatisations. */
export async function loadUserIntelligenceContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, sector, summary, updated_at, is_public")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);

  const rows = (projects ?? []) as ProjectIntelRow[];
  if (rows.length === 0) {
    return `MÉMOIRE OKAPI (utilisateur ${userId.slice(0, 8)}…):
- Aucun projet cloud encore. Encourage à générer une 1re app métier RDC (boutique, école, clinique…).
- Propose WhatsApp + Mobile Money quand pertinent.
- Parle français simple, actions concrètes.`;
  }

  const lines = rows.map((p, i) => {
    const sec = p.sector?.trim() || "Général";
    const sum = p.summary?.trim()
      ? p.summary.trim().slice(0, 120)
      : "sans résumé";
    const pub = p.is_public ? "public" : "privé";
    const when = p.updated_at
      ? new Date(p.updated_at).toLocaleDateString("fr-FR")
      : "?";
    return `${i + 1}. « ${p.title} » · ${sec} · ${pub} · maj ${when} — ${sum}`;
  });

  // Compte léger des records sur le projet le plus récent (si table dispo)
  let recordsHint = "";
  const topId = rows[0]?.id;
  if (topId) {
    const { count, error } = await supabase
      .from("app_records")
      .select("id", { count: "exact", head: true })
      .eq("project_id", topId)
      .eq("user_id", userId);
    if (!error && typeof count === "number") {
      recordsHint = `\n- Données live (projet le plus récent): ${count} enregistrement(s) app_records.`;
    }
  }

  const sectors = [
    ...new Set(rows.map((p) => p.sector?.trim()).filter(Boolean) as string[]),
  ];

  return `MÉMOIRE OKAPI — contexte réel de l’utilisateur (RDC / digitalisation):
- ${rows.length} projet(s) cloud. Secteurs: ${sectors.join(", ") || "mixte"}.
- Projets récents:
${lines.join("\n")}${recordsHint}

Règles d’intelligence:
1. Appuie-toi sur CES projets (noms, secteurs) — ne invente pas d’autres business.
2. Priorise la prochaine action utile (sauver, publier, stock, clients, WhatsApp).
3. Français clair, concret, pour un entrepreneur congolais.
4. Si une automatisation: briefing actionnable, pas de blabla.`;
}

/** Bloc court injecté dans les system prompts (generate / studio). */
export function intelligenceSystemBlock(memory: string | null | undefined) {
  const m = memory?.trim();
  if (!m) return "";
  return `\n\n${m}\n`;
}

/** Conseil coach post-génération (côté client). */
export function coachNextStep(opts: {
  hasHtml: boolean;
  hasSql: boolean;
  loggedIn: boolean;
  projectSaved: boolean;
  sector?: string;
  /** false = utilisateur Conseiller (pas de push Studio) */
  offerStudio?: boolean;
}): string {
  const sector = opts.sector?.trim() || "ton activité";
  const offerStudio = opts.offerStudio !== false;
  if (!opts.hasHtml) {
    return offerStudio
      ? `Prochaine étape: décris plus clairement ce que ${sector} doit faire (ex. « catalogue + panier WhatsApp »).`
      : `Prochaine étape: pose ta question ou demande un contenu (article, script, conseil métier).`;
  }
  if (!opts.loggedIn) {
    return `Prochaine étape: connecte-toi puis Sauver — ainsi Preview garde les vraies données pour ${sector}.`;
  }
  if (!opts.projectSaved) {
    return `Prochaine étape: clique Sauver (Ctrl+S) pour activer le cloud et retrouver le projet dans Mes projets.`;
  }
  if (!offerStudio) {
    return `Prochaine étape: teste la Preview. Pour modifier le code plus tard, ouvre Studio (optionnel).`;
  }
  if (opts.hasSql) {
    return `Prochaine étape: ouvre Preview, teste un enregistrement. Studio seulement si tu veux éditer le code.`;
  }
  return `Prochaine étape: teste la Preview. Studio = pour les builders qui veulent toucher au code.`;
}
