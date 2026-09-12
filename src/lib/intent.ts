/** Detect if the user wants a live HTML app build / preview update. */
export function wantsAppBuild(message: string, hasPreview: boolean): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  if (hasPreview && wantsDebug(message)) return true;

  const explicitBuild =
    /\b(cree|creer|gener[eè]e?|construire|fabrique|build|genere moi|fais[- ]moi (un|une|le|la)|site web|landing|mini[- ]?app|application web|page web|boutique en ligne|menu restaurant|fullstack|full[- ]?stack|supabase|backend|back[- ]?end|avec (une )?base|api rest|grand projet|gros projet|plateforme|crm|saas|dashboard|marketplace)\b/.test(
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

  if (pureQuestion && !explicitBuild && !previewEdit) return false;
  if (explicitBuild || previewEdit) return true;
  return false;
}

/** Detect bugfix / debug requests (error paste, "ça marche pas", etc.). */
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
