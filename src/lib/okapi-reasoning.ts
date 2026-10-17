/** Profondeur du tour — suite de conversation, décision, calcul. Pas les salutations. */

function normalize(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreeting(n: string) {
  return (
    /^(salut|bonjour|bonsoir|mbote|hello|hi|hey|merci|ok|oui|non|ca va|cv|bon)\b/.test(
      n,
    ) && n.length < 42
  );
}

function isFollowUp(n: string, historyCount: number) {
  if (historyCount < 1) return false;
  if (
    /^(et |aussi |continue|precize|precise|pourquoi|combien|lequel|laquelle|du coup|donc |ok mais|et si|ca |c est |cest |pareil|encore|developpe|detaille)/.test(
      n,
    )
  ) {
    return true;
  }
  return n.length < 90 && n.split(" ").length <= 14;
}

function isDecision(n: string) {
  return /\b(que faire|conseil|choisir|lequel|laquelle|mieux|risque|plan|strategie|budget|combien|coute|cout|investir|ouvrir|lancer|priorite|vaut le coup|compar)\b/.test(
    n,
  );
}

function isCalc(n: string) {
  return /\b(calcule|calcul|%\s|pour\s*cent|pourcent|somme|total|marge|benefice|benef|taux|x\s*\d|\d+\s*[\*x×]\s*\d+)\b/.test(
    n,
  ) || /\d[\d\s.,]{2,}\s*(cdf|usd|fc|franc)/.test(n);
}

export function turnNeedsDeepReasoning(
  message: string,
  historyCount = 0,
): boolean {
  const n = normalize(message);
  if (!n || isGreeting(n)) return false;
  return isDecision(n) || isCalc(n) || (isFollowUp(n, historyCount) && n.includes("?"));
}

/**
 * Consigne interne pour ce message. Vide si le tour est une simple salutation.
 */
export function okapiTurnBrief(message: string, historyCount = 0): string {
  const n = normalize(message);
  if (!n) return "";
  if (isGreeting(n)) {
    return `\n\nTOUR SIMPLE: salutation. Une phrase naturelle, dans la langue du message. Pas de cours, pas de liste.`;
  }

  const follow = isFollowUp(n, historyCount);
  const decision = isDecision(n);
  const calc = isCalc(n);
  const deep = decision || calc || (follow && n.includes("?"));

  const lines = [
    `\n\nINTELLIGENCE DE CE TOUR (interne — n’écris pas ces étapes, seulement la réponse):`,
    `- Identifie le besoin (chiffre, choix, texte, fait) puis réponds à ça, pas à côté.`,
    `- Première phrase = la réponse. Ensuite la preuve : nombre, unité, condition, ou la raison qui change le choix.`,
    `- Pas de ** gras, pas de titre #, pas de LaTeX. Texte brut.`,
    `- Sûr vs supposé: un nom, un prix officiel, une loi ou une date absents du contexte ou des sources = « à vérifier ». Ne les invente pas.`,
  ];
  if (follow) {
    lines.push(
      `- Suite: le sujet est déjà dans l’historique. Résous « ça », « et », « le prix », « pourquoi ». Ne demande pas de répéter le contexte.`,
    );
  }
  if (calc) {
    lines.push(
      `- Calcul: note complète, pas un résumé. Formule demandée avec tous ses coefficients (φ, 0,85, etc. — ne les retire pas), chaque symbole et son unité, substitution chiffrée, résultat avec l’unité. Vérifie l’arithmétique. Texte lisible, jamais de LaTeX.`,
    );
  }
  if (decision) {
    lines.push(
      `- Décision RDC: une recommandation, le pourquoi en une phrase, le prochain geste (Mobile Money, WhatsApp, démarche simple). Pas dix options.`,
    );
  }
  if (deep && !calc) {
    lines.push(
      `- Développe seulement ce qui change la décision. Pas d’introduction.`,
    );
  }
  return lines.join("\n");
}
