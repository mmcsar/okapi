/** Brief Studio : comprendre l’idée avant de scaffolder une plateforme. */

export type StudioBriefMessage = {
  role: "user" | "assistant";
  content: string;
};

const BUILD_NOW_RE =
  /\b(vas[- ]y|genere(r)?(\s+(le\s+projet|tout|maintenant))?|cree(r)?\s+(maintenant|direct|le\s+projet|l'?app)|lance(\s+le\s+projet)?|\bgo\b|build\s+(it|now)|fais[- ]le|construis|c'?est\s+bon[,.]?\s*(cree|genere)|ok[,.]?\s*(cree|genere|vas[- ]y)|d'?accord[,.]?\s*(cree|genere)|parfait[,.]?\s*(cree|genere)|je\s+confirme|brief\s+(complet|ok)|assez\s+d'?infos|tu\s+peux\s+(creer|créer|generer|générer))\b/i;

const CLARIFY_MARKER_RE =
  /[?？]|modules?|public\b|cible|Mobile Money|WhatsApp|ecrans?|écrans?|roles?|r[oô]les?|pr[eé]cis|avant de (cr[eé]er|construire)|je (veux|dois) (mieux )?comprendre|quel(le)?s? (sont|est)/i;

/**
 * Brief assez clair pour livrer une plateforme robuste sans autre question.
 */
export function isStudioBriefReady(
  instruction: string,
  opts?: {
    history?: StudioBriefMessage[];
    hasExistingFiles?: boolean;
  },
): boolean {
  const trimmed = instruction.trim();
  if (!trimmed) return false;

  const m = trimmed.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  if (BUILD_NOW_RE.test(m)) return true;

  // Confirmation courte après échange (« crée », « ok », « vas-y »)
  if (
    /^(ok|oui|vas[- ]y|go|cree|creer|genere|generer|lance|c'?est\s+bon|parfait)[.!]?$/i.test(
      m.trim(),
    )
  ) {
    const prior = (opts?.history || []).filter((h) => h.content?.trim());
    const lastAsst = [...prior].reverse().find((h) => h.role === "assistant");
    if (lastAsst && CLARIFY_MARKER_RE.test(lastAsst.content)) return true;
  }

  // Projet déjà en cours : on itère / on complète sans re-clarifier
  if (opts?.hasExistingFiles) return true;

  const prior = (opts?.history || []).filter(
    (h) => h.content?.trim() && h.content.trim() !== trimmed,
  );
  const lastAsst = [...prior].reverse().find((h) => h.role === "assistant");
  if (lastAsst && CLARIFY_MARKER_RE.test(lastAsst.content) && trimmed.length >= 35) {
    return true;
  }

  let signals = 0;
  if (
    /\b(whatsapp|mobile money|orange money|airtel|m[- ]?pesa|cdf|francs?)\b/i.test(
      m,
    )
  ) {
    signals += 1;
  }
  if (
    /\b(client|vendeur|admin|patient|eleve|el[eè]ve|parent|reception|r[eé]ception|manager|agent|utilisateur|role|r[oô]le)\b/i.test(
      m,
    )
  ) {
    signals += 1;
  }
  if (
    /\b(panier|stock|catalogue|commande|rdv|rendez[- ]vous|paiement|inscription|pipeline|dashboard|tableau de bord|facture|caisse|livraison|reservation|r[eé]servation)\b/i.test(
      m,
    )
  ) {
    signals += 1;
  }
  if (
    /\b(kinshasa|lubumbashi|goma|gombe|rdc|congo|matadi|bukavu)\b/i.test(m)
  ) {
    signals += 1;
  }
  if (
    /\b(ecran|écran|page|module|onglet|section|liste|formulaire|nav)\b/i.test(m)
  ) {
    signals += 1;
  }
  if (
    /[,;•].{10,}[,;•]/.test(trimmed) ||
    (trimmed.match(/\n/g) || []).length >= 2
  ) {
    signals += 1;
  }

  if (trimmed.length >= 100 && signals >= 2) return true;
  if (trimmed.length >= 160 && signals >= 1) return true;
  if (trimmed.length >= 240) return true;

  return false;
}

/** Workspace vide + idée encore floue → d’abord comprendre, puis créer. */
export function shouldClarifyBeforeScaffold(
  instruction: string,
  opts?: {
    history?: StudioBriefMessage[];
    hasExistingFiles?: boolean;
  },
): boolean {
  if (opts?.hasExistingFiles) return false;
  return !isStudioBriefReady(instruction, opts);
}
