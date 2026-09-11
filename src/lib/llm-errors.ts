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
      "Gemini bloque ta région (souvent la RDC). " +
      "Solution : ajoute OPENAI_API_KEY dans .env.local " +
      "puis mets LLM_PROVIDER=openai et redémarre. " +
      "Sinon OPENROUTER_API_KEY, VPN, ou ANTHROPIC_API_KEY."
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
