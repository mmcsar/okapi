/** Detect if the user wants a live HTML app build / preview update. */

/** Deux lanes produit : Conseiller (savoir/contenu) vs Créateur (apps → Studio). */
export type OkapiAgentLane = "conseil" | "creer";

const LANE_STORAGE_KEY = "okapi_agent_lane";

export function getStoredAgentLane(): OkapiAgentLane {
  if (typeof window === "undefined") return "conseil";
  try {
    const v = localStorage.getItem(LANE_STORAGE_KEY);
    if (v === "creer" || v === "conseil") return v;
  } catch {
    /* ignore */
  }
  return "conseil";
}

export function setStoredAgentLane(lane: OkapiAgentLane) {
  try {
    localStorage.setItem(LANE_STORAGE_KEY, lane);
  } catch {
    /* ignore */
  }
}

/** Recherche / contenu / conseils — pas Studio. */
export function wantsKnowledgeOrContent(message: string): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return /\b(explique|recherche|renseigne|inform|conseil|avise|idee de contenu|redige|ecris (un |une )?(article|post|script|discours|lettre|message)|traduis|resume|resumer|c[' ]est quoi|qu[' ]est[- ]ce|comment (faire|marche|fonctionne)|pourquoi|difference|formation|apprendre|cours|marketing|strategie|business plan|etude de marche)\b/i.test(
    m,
  );
}

/** Métiers / écrans RDC — même sans le verbe « crée ». */
const METIER_BUILD_RE =
  /\b(boutique|catalogue|stock|panier|checkout|commande|mobile\s*money|m[- ]?pesa|airtel\s*money|orange\s*money|whatsapp|restaurant|menu|clinique|patient|rendez[- ]?vous|ecole|eleve|crm|clients?|dashboard|marketplace|facture|caisse|flotte|livraison)\b/i;

export function wantsAppBuild(
  message: string,
  hasPreview: boolean,
  lane: OkapiAgentLane = "creer",
): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  // Lane Conseiller : uniquement un « crée une app… » explicite (jamais Studio forcé)
  if (lane === "conseil") {
    if (hasPreview && wantsDebug(message)) return true;
    return /\b(cree|creer|genere|construire|fabrique|build|fais[- ]moi).{0,40}\b(app|application|site|page|boutique|projet|dashboard|crm)\b/i.test(
      m,
    );
  }

  if (hasPreview && wantsDebug(message)) return true;

  // Priorité savoir : si la demande est clairement informative, pas de builder
  if (
    wantsKnowledgeOrContent(message) &&
    !/\b(cree|creer|genere|construire)\b.{0,30}\b(app|site|boutique)\b/i.test(m)
  ) {
    return false;
  }

  const explicitBuild =
    /\b(cree|creer|gener[eè]e?|construire|fabrique|build|genere moi|fais[- ]moi (un|une|le|la)|lance|demarre|demarrer|site web|landing|mini[- ]?app|application web|page web|boutique en ligne|menu restaurant|fullstack|full[- ]?stack|supabase|backend|back[- ]?end|avec (une )?base|api rest|grand projet|gros projet|plateforme|crm|saas|dashboard|marketplace|app (pour|de|web)|une app|un site|le projet)\b/.test(
      m,
    );

  /** Brief métier assez long = générer, pas bavarder. */
  const metierBrief =
    METIER_BUILD_RE.test(m) &&
    m.length >= 40 &&
    /\b(avec|pour|prix|cdf|kinshasa|gombe|rdc|ecran|module|paiement|produit)\b/.test(
      m,
    );

  const previewEdit =
    hasPreview &&
    /\b(change|modifie|ajoute|enleve|supprime|mets|met a jour|update|couleur|titre|logo|bouton|section|header|footer|panier|whatsapp|table|sql|auth|api)\b/.test(
      m,
    );

  const pureQuestion =
    /^(qui|que|quoi|quel|quelle|quels|quelles|ou|quand|pourquoi|comment|combien|explique|calcule|resols|traduis|resum[eé]|c[' ]est quoi|qu[' ]est[- ]ce)/.test(
      m.trim(),
    ) ||
    /\b(formule|equation|math|histoire|definition|diff[eé]rence entre|aide[- ]moi a comprendre)\b/.test(
      m,
    );

  if (pureQuestion && !explicitBuild && !previewEdit && !metierBrief) {
    return false;
  }
  if (explicitBuild || previewEdit || metierBrief) return true;
  return false;
}

/** Detect bug fix / debug requests (error paste, "ça marche pas", etc.). */
export function wantsDebug(message: string): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  if (
    /\b(debug|debogue|deboguer|bug|bugs|corrige|corriger|fix|fixer|repare|reparer)\b/.test(
      m,
    )
  ) {
    return true;
  }

  if (
    /\b(ne marche pas|marche pas|fonctionne pas|ne fonctionne pas|ca bug|casse|broken|ko)\b/.test(
      m,
    )
  ) {
    return true;
  }

  if (
    /\b(erreur|error|exception|traceback|stack trace|typeerror|referenceerror|syntaxerror|failed|echec|echoue|undefined is not|is not a function|cannot read|null is not|unexpected token)\b/.test(
      m,
    )
  ) {
    return true;
  }

  // Looks like a stack / console dump
  if (/\bat\s+[\w$.]+\s*\([^)]*:\d+:\d+\)/.test(message)) return true;
  if (/^\s*Error:/m.test(message) || /^\s*\w*Error:/m.test(message)) return true;

  return false;
}

/** Chat a inventé que le builder est absent — à renvoyer vers generate. */
export function chatDeniedBuilder(answer: string): boolean {
  const a = answer.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return (
    /\b(constructeur|builder|generateur)\b/.test(a) &&
    /\b(pas (encore )?disponible|ne (peux|peut) pas (encore )?(lancer|generer|creer|construire)|n[' ]est pas disponible|dans cette interface|je ne peux pas encore)\b/.test(
      a,
    )
  );
}
