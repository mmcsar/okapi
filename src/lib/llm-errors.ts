export function isLocationBlocked(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /location is not supported|FAILED_PRECONDITION|User location/i.test(msg);
}

export function isRetryableLlm(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED|overloaded/i.test(
    msg,
  );
}

export function friendlyLlmError(err: unknown) {
  if (isLocationBlocked(err)) {
    return (
      "Gemini bloque ta région (RDC). Okapi doit utiliser OpenAI : " +
      "vérifie OPENAI_API_KEY + LLM_PROVIDER=openai sur Vercel, " +
      "supprime ou vide GEMINI_API_KEY, puis Redeploy. " +
      "En local : même chose dans .env.local + redémarrer npm run dev."
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Avoid dumping huge JSON blobs in the chat UI
  try {
    const parsed = JSON.parse(msg) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    /* not json */
  }
  const loc = msg.match(/"message"\s*:\s*"([^"]+)"/);
  if (loc?.[1]) return loc[1];
  return msg.slice(0, 400);
}
