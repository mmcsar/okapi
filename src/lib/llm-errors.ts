export function isLocationBlocked(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /location is not supported|FAILED_PRECONDITION|User location/i.test(
    msg,
  );
}

export function isRetryableLlm(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED|overloaded|no credits|insufficient_quota|quota/i.test(
    msg,
  );
}

function rawMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(msg) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    /* not json */
  }
  const loc = msg.match(/"message"\s*:\s*"([^"]+)"/);
  if (loc?.[1]) return loc[1];
  return msg;
}

/**
 * Certains modèles collent un verdict de filtre après le texte utile.
 * On ne montre jamais ces lignes.
 */
export function stripModelSafetyFooter(text: string) {
  return text
    .replace(
      /[ \t]*(?:User|Response|Assistant)\s+Safety\s*:\s*[A-Za-z]+[ \t]*/gi,
      "",
    )
    .replace(
      /[ \t]*(?:User|Response|Assistant)\s+Safety\s*:?\s*$/i,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Enlève **gras** / titres MD trop visibles dans le chat Accueil. */
export function stripChatMarkdown(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`\n]+)`/g, "$1");
}

/**
 * Coupe les ouvertures « chatbot » et les digressions méta (capacité / Accueil).
 * Garde le fond utile.
 */
export function polishAssistantProse(text: string) {
  let t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return t;

  // Prefaces trop polies / vides
  t = t.replace(
    /^(je\s+comprends\s+(votre|ta)\s+demande[^.!?\n]*[.!?]\s*)+/i,
    "",
  );
  t = t.replace(
    /^(bien\s+s[uû]r[!]?|absolument[!]?|excellente\s+question[!]?|avec\s+plaisir[!]?)\s*/i,
    "",
  );
  t = t.replace(
    /^okapi\s+\(mmc\s+sarl\)\s+[^.!?\n]*[.!?]\s*/i,
    "",
  );

  // Paragraphes méta « connectez-vous / plateforme gère / je dois être honnête sur mes capacités »
  const lines = t.split(/\n+/);
  const filtered = lines.filter((line) => {
    const n = line
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    if (!n.trim()) return true;
    if (
      /\b(je dois etre honnete sur mes capacites|cette fonctionnalite est geree|connectez[- ]vous sur|consulter le calendrier|affichera? automatiquement|n.hesitez pas a preciser)\b/.test(
        n,
      )
    ) {
      return false;
    }
    return true;
  });
  t = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

/**
 * Certains flux collent la même réponse deux fois bout à bout.
 * Garde une seule copie.
 */
export function dedupeRepeatedAssistantText(text: string) {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (t.length < 120) return t;

  const half = Math.floor(t.length / 2);
  const left = t.slice(0, half).trim();
  const right = t.slice(half).trim();
  if (left.length > 80 && left === right) return left;

  const norm = (s: string) =>
    s
      .replace(/\*\*/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  // Même ouverture répétée plus loin (copie collée)
  const opener = t.split("\n").find((l) => l.trim().length >= 24)?.trim();
  if (opener) {
    const second = t.indexOf(opener, opener.length + 8);
    if (second > 80) {
      const a = t.slice(0, second).trim();
      const b = t.slice(second).trim();
      const na = norm(a);
      const nb = norm(b);
      if (
        na.length > 80 &&
        nb.length > 80 &&
        (na === nb ||
          (Math.abs(na.length - nb.length) < Math.max(na.length, nb.length) * 0.2 &&
            na.slice(0, 120) === nb.slice(0, 120)))
      ) {
        return a;
      }
    }
  }

  // Blocs séparés par ligne vide : 1re moitié = 2e moitié
  const blocks = t.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length >= 2 && blocks.length % 2 === 0) {
    const mid = blocks.length / 2;
    const a = blocks.slice(0, mid).join("\n\n");
    const b = blocks.slice(mid).join("\n\n");
    if (norm(a).length > 80 && norm(a) === norm(b)) return a;
  }

  return t;
}

/**
 * Messages visibles par l’utilisateur final.
 * Ne jamais citer OpenAI, Gemini, clés API, Vercel, etc.
 */
export function friendlyLlmError(err: unknown) {
  const msg = rawMessage(err);

  if (
    /402|payment required|no credits|insufficient_quota|billing|quota|payment|You have no credits|can only afford/i.test(
      msg,
    )
  ) {
    return "Le crédit IA Okapi est épuisé. Recharge le compte, puis réessaie.";
  }

  if (/empty_response|empty response|réponse vide/i.test(msg)) {
    return "Le moteur IA a renvoyé une réponse vide (souvent modèle gratuit saturé). Réessaie dans 10 s, ou raccourcis le brief — Agent Accueil est plus léger.";
  }

  if (/projet vide|réponse projet invalide|invalid_json|not valid project/i.test(msg)) {
    return "Le projet généré est incomplet. Réessaie avec un brief un peu plus court, ou depuis Agent Accueil.";
  }

  if (/timeout|ETIMEDOUT|aborted|fetch failed|network|ECONNRESET/i.test(msg)) {
    return "La génération a pris trop de temps ou le réseau a coupé. Réessaie dans quelques secondes.";
  }

  if (/429|rate limit|too many requests|okapi_quota|limite du jour/i.test(msg)) {
    return "Okapi reçoit beaucoup de demandes. Recharge la page et réessaie dans un instant.";
  }

  if (/okapi_busy|très sollicité/i.test(msg)) {
    return "Okapi est très sollicité. Réessaie dans quelques secondes.";
  }

  if (isLocationBlocked(err)) {
    return "Okapi est temporairement indisponible dans ta zone. Réessaie plus tard.";
  }

  if (/503|UNAVAILABLE|overloaded|high demand/i.test(msg)) {
    return "Okapi est un peu saturé. Recharge la page et réessaie.";
  }

  if (/401|403|invalid.?api.?key|incorrect.?api.?key|auth/i.test(msg)) {
    return "Okapi est temporairement indisponible. Réessaie plus tard.";
  }

  if (/OPENAI|ANTHROPIC|GEMINI|OPENROUTER|LLM_PROVIDER|API_KEY/i.test(msg)) {
    return "Okapi est temporairement indisponible. Recharge la page et réessaie.";
  }

  return "Okapi n’a pas pu répondre. Recharge la page et réessaie.";
}

/** Message config manquante — côté utilisateur (pas de détails techniques). */
export function friendlyConfigError() {
  return "Okapi est temporairement indisponible. Réessaie plus tard.";
}
