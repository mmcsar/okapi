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

/**
 * Qui détient un poste / actualité « live » — risque élevé d’hallucination.
 * Mieux : « je ne confirme pas » + sources officielles, plutôt qu’un faux nom.
 */
export function wantsLiveCurrentFact(message: string): boolean {
  const m = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
  const office =
    /\b(gouverneur|vice[- ]?gouverneur|ministre|premier ministre|president|maire|bourgmestre|depute|senateur|chef de l etat|gouvernement provincial)\b/.test(
      m,
    );
  const who =
    /\b(qui (est|sont)|quel(le)? (est|sont)|nom (du|de la|des)|actuel(le)?|aujourd hui|en ce moment|maintenant)\b/.test(
      m,
    ) || /\bqui\b.{0,40}\b(gouverneur|ministre|maire|president)\b/.test(m);
  const news =
    /\b(dernieres? nouvelles?|actu(alite)?s?|ce qui se passe|breaking)\b/.test(
      m,
    );
  return (office && who) || (office && /\b(du|de la|des|en|au|aux)\b/.test(m)) || news;
}

/** Métiers / écrans RDC — même sans le verbe « crée ». */
const METIER_BUILD_RE =
  /\b(boutique|catalogue|stock|panier|checkout|commande|mobile\s*money|m[- ]?pesa|airtel\s*money|orange\s*money|whatsapp|restaurant|menu|clinique|patient|rendez[- ]?vous|ecole|eleve|crm|clients?|dashboard|marketplace|facture|caisse|flotte|livraison)\b/i;

/** Demande d’image seule (pas une app avec photos). */
export function wantsImageGen(message: string): boolean {
  const m = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
  // « limage » / « l image » / fautes fréquentes
  const norm = m.replace(/\bl\s*image\b/g, " image ").replace(/\s+/g, " ");

  const imageAsk =
    /\b(cree|creer|gener[eè]e?|fabrique|fais|dessine|illustre|montre)\b.{0,60}\b(image|illustration|photo|logo|visuel|dessin|picture|picto)\b/.test(
      norm,
    ) ||
    /\b(image|illustration|photo|logo|visuel|dessin)\b.{0,40}\b(de|d |du|des|pour|avec|qui|un|une)\b/.test(
      norm,
    ) ||
    /\b(genere|cree|fais)[- ]?(moi )?(une? |un |la |le )?(image|illustration|photo|logo|visuel)\b/.test(
      norm,
    ) ||
    /\b(une?|la) (belle )?image\b/.test(norm);

  if (!imageAsk) return false;
  // « crée un site avec des photos… » → builder, pas image seule
  if (
    /\b(app|application|site|page web|boutique|dashboard|crm|landing)\b/.test(
      norm,
    ) &&
    !/\b(juste|seulement|uniquement).{0,24}\b(image|logo|illustration|photo|visuel)\b/.test(
      norm,
    )
  ) {
    return false;
  }
  // « projet » seul ne doit pas bloquer une image (« mon projet photo »)
  if (
    /\b(projet)\b/.test(norm) &&
    /\b(app|site|web|fullstack|crm)\b/.test(norm)
  ) {
    return false;
  }
  return true;
}

/** Prompt nettoyé pour /api/image. */
export function extractImagePrompt(message: string): string {
  let p = message.trim();
  p = p.replace(/^(okapi[,:]?\s*)/i, "");
  p = p.replace(/^(s['’]il te pla[iî]t[,:]?\s*)/i, "");
  p = p.replace(/^(peux[- ]tu|pourrais[- ]tu|svp)[,:]?\s*/i, "");
  p = p.replace(
    /^(cr[eé]e[rz]?|g[eé]n[eè]re[rz]?|fabrique[rz]?|fais[- ]moi|dessine[rz]?|illustre[rz]?)(\s*moi)?\s*(une?|un|le|la|des)?\s*(image|illustration|photo|logo|visuel|dessin)\s*(de|d['’]|pour|avec|:)?\s*/i,
    "",
  );
  const out = (p.trim() || message.trim()).slice(0, 500);
  return out.length >= 3 ? out : message.trim().slice(0, 500);
}

export function wantsAppBuild(
  message: string,
  hasPreview: boolean,
  lane: OkapiAgentLane = "creer",
): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  // Image seule → /api/image, pas le builder HTML
  if (wantsImageGen(message)) return false;

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
