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
  if (!follow && !deep && n.length < 28) return "";

  const lines = [
    `\n\nINTELLIGENCE DE CE TOUR (interne — n’écris pas ces étapes, seulement la réponse):`,
  ];
  if (follow) {
    lines.push(
      `- Suite: le sujet est déjà dans l’historique. Résous « ça », « et », « le prix », « pourquoi ». Ne demande pas de répéter le contexte.`,
    );
  }
  lines.push(
    `- Première phrase = la réponse. Ensuite seulement ce qui change la décision.`,
  );
  lines.push(
    `- Sûr vs supposé: un nom, un prix officiel, une loi ou une date absents du contexte ou des sources = « à vérifier ». Ne les invente pas.`,
  );
  if (calc) {
    lines.push(
      `- Calcul: écris l’opération, l’unité (CDF, %), puis le résultat. Revérifie l’arithmétique avant de conclure.`,
    );
  }
  if (decision) {
    lines.push(
      `- Décision RDC: une recommandation, le pourquoi en une phrase, le prochain geste (Mobile Money, WhatsApp, démarche simple). Pas dix options.`,
    );
  }
  if (deep) {
    lines.push(
      `- Profondeur: 4 à 7 lignes utiles après la première phrase. Pas d’introduction, pas de « excellente question ».`,
    );
  }
  return lines.join("\n");
}
