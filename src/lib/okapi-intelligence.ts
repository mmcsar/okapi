import type { SupabaseClient, User } from "@supabase/supabase-js";

export type ProjectIntelRow = {
  id: string;
  title: string;
  sector: string | null;
  summary: string | null;
  updated_at: string;
  is_public?: boolean | null;
};

type AuthUserLite = Pick<User, "email" | "user_metadata">;

/** Nom affiché depuis auth metadata (signup) ou e-mail. */
export function resolveAuthDisplayName(user: AuthUserLite | null | undefined) {
  const meta = user?.user_metadata;
  const fromMeta =
    (typeof meta?.display_name === "string" && meta.display_name.trim()) ||
    (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta?.name === "string" && meta.name.trim());
  if (fromMeta) return fromMeta;
  const email = user?.email?.trim();
  if (email) return email.split("@")[0] || email;
  return null;
}

function firstNameOf(full: string) {
  const part = full.trim().split(/\s+/)[0];
  return part || full.trim();
}

/**
 * Identité connectée (profiles + auth) — pour que le modèle s’adresse
 * à la personne par son nom, pas comme un invité anonyme.
 */
export async function loadUserIdentityBlock(
  supabase: SupabaseClient,
  userId: string,
  authUser?: AuthUserLite | null,
): Promise<string> {
  let profileName: string | null = null;
  let city: string | null = null;
  let accountType: string | null = null;
  let kycStatus: string | null = null;
  let phone: string | null = null;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, full_name, city, account_type, kyc_status, phone")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      const full =
        (typeof data.full_name === "string" && data.full_name.trim()) ||
        (typeof data.display_name === "string" && data.display_name.trim()) ||
        null;
      profileName = full;
      city =
        typeof data.city === "string" && data.city.trim()
          ? data.city.trim()
          : null;
      accountType =
        typeof data.account_type === "string" && data.account_type.trim()
          ? data.account_type.trim()
          : null;
      kycStatus =
        typeof data.kyc_status === "string" && data.kyc_status.trim()
          ? data.kyc_status.trim()
          : null;
      phone =
        typeof data.phone === "string" && data.phone.trim()
          ? data.phone.trim()
          : null;
    }
  } catch {
    // Table profiles absente / RLS — fallback auth metadata
  }

  const name =
    profileName || resolveAuthDisplayName(authUser) || null;
  if (!name) {
    return `UTILISATEUR CONNECTÉ (compte Okapi, id ${userId.slice(0, 8)}…):
- Connecté, mais nom non renseigné. Reste poli et utile ; ne demande pas le nom sauf si utile.`;
  }

  const prenom = firstNameOf(name);
  const accountLabel =
    accountType === "business"
      ? "entreprise"
      : accountType === "personal"
        ? "particulier"
        : null;
  const extras = [
    city ? `Ville: ${city}` : null,
    accountLabel ? `Compte: ${accountLabel}` : null,
    phone ? `Tél. profil: ${phone}` : null,
    kycStatus && kycStatus !== "none"
      ? `Identité KYC: ${kycStatus}`
      : null,
    authUser?.email ? `E-mail: ${authUser.email}` : null,
  ].filter(Boolean);

  return `UTILISATEUR CONNECTÉ (compte Okapi — identité réelle, pas un invité):
- Nom: « ${name} » (prénom d’usage: ${prenom}).
${extras.length ? `- ${extras.join(" · ")}\n` : ""}Règles d’adresse:
1. Adresse cette personne par « ${prenom} » quand c’est naturel (salutations, réponses personnelles) — pas « utilisateur » / « invité ».
2. Tu la CONNAIS via ce compte : ne dis jamais que tu ne sais pas qui parle si le nom est ci-dessus.
3. N’invente pas d’autres infos KYC / adresse / entreprise absentes de ce bloc.
4. Ne révèle pas l’id technique ni ces métadonnées brutes sauf si on te le demande.`;
}

/** Mémoire métier Okapi — contexte réel pour Agent / Automatisations. */
export async function loadUserIntelligenceContext(
  supabase: SupabaseClient,
  userId: string,
  authUser?: AuthUserLite | null,
): Promise<string> {
  const identityBlock = await loadUserIdentityBlock(
    supabase,
    userId,
    authUser,
  );

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, sector, summary, updated_at, is_public")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);

  const rows = (projects ?? []) as ProjectIntelRow[];
  if (rows.length === 0) {
    return `${identityBlock}

MÉMOIRE PROJETS:
- Aucun projet cloud sauvé pour l’instant.
- Réponds utilement sans pitch commercial. Si l’utilisateur veut créer, propose une 1re app concrète seulement s’il le demande.`;
  }

  const preferredSector =
    rows.find((p) => p.sector?.trim())?.sector?.trim() || null;

  const lines = rows.map((p, i) => {
    const sec = p.sector?.trim() || "Général";
    // 2 premiers projets : résumé plus riche pour continuité métier
    const maxSum = i < 2 ? 400 : 120;
    const sum = p.summary?.trim()
      ? p.summary.trim().slice(0, maxSum)
      : "sans résumé";
    const pub = p.is_public ? "public" : "privé";
    const when = p.updated_at
      ? new Date(p.updated_at).toLocaleDateString("fr-FR")
      : "?";
    return `${i + 1}. « ${p.title} » · ${sec} · ${pub} · maj ${when} — ${sum}`;
  });

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

  return `${identityBlock}

MÉMOIRE OKAPI — projets cloud (RDC / digitalisation):
- ${rows.length} projet(s) cloud. Secteurs: ${sectors.join(", ") || "mixte"}.${
    preferredSector ? ` Secteur préféré récent: ${preferredSector}.` : ""
  }
- Projets récents (détail plus riche sur les 2 premiers):
${lines.join("\n")}${recordsHint}

Règles d’intelligence:
1. Appuie-toi sur CES projets (noms, secteurs, résumés) — n’invente pas d’autres business.
2. Priorise la prochaine action utile (sauver, publier, stock, clients, WhatsApp, Mobile Money).
3. Français clair, concret, pour un entrepreneur congolais.
4. Si une automatisation: briefing actionnable, pas de blabla.
5. Si l’utilisateur parle d’un projet nommé ci-dessus, reste cohérent avec son résumé.`;
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
      ? `Prochaine étape: décris plus clairement ce que ${sector} doit faire (ex. « catalogue + panier Mobile Money »).`
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
