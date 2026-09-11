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
 * Messages visibles par l’utilisateur final.
 * Ne jamais citer OpenAI, Gemini, clés API, Vercel, etc.
 */
export function friendlyLlmError(err: unknown) {
  const msg = rawMessage(err);

  if (
    /no credits|insufficient_quota|billing|quota|payment|You have no credits/i.test(
      msg,
    )
  ) {
    return "Okapi est temporairement indisponible. Recharge la page et réessaie dans quelques minutes.";
  }

  if (/429|rate limit|too many requests/i.test(msg)) {
    return "Okapi reçoit beaucoup de demandes. Recharge la page et réessaie dans un instant.";
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
