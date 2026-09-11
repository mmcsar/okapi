/** Detect if the user wants a live HTML app build / preview update. */
export function wantsAppBuild(message: string, hasPreview: boolean): boolean {
  const m = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  const explicitBuild =
    /\b(cree|creer|gener[eè]e?|construire|fabrique|build|genere moi|fais[- ]moi (un|une|le|la)|site web|landing|mini[- ]?app|application web|page web|boutique en ligne|menu restaurant)\b/.test(
      m,
    );

  const previewEdit =
    hasPreview &&
    /\b(change|modifie|ajoute|enleve|supprime|mets|met a jour|update|couleur|titre|logo|bouton|section|header|footer|panier|whatsapp)\b/.test(
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
