/**
 * Quotas LLM Okapi — protection budget / charge.
 * Mémoire process (Vercel: best-effort par instance).
 * Prochaine étape: table usage_daily / Redis.
 */

type Kind = "chat" | "generate";

type DayBucket = {
  day: string; // YYYY-MM-DD UTC
  chat: number;
  generate: number;
};

type GlobalQuotaState = {
  byKey: Map<string, DayBucket>;
  inFlightGenerate: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __okapiLlmQuota: GlobalQuotaState | undefined;
}

function state(): GlobalQuotaState {
  if (!globalThis.__okapiLlmQuota) {
    globalThis.__okapiLlmQuota = {
      byKey: new Map(),
      inFlightGenerate: 0,
    };
  }
  return globalThis.__okapiLlmQuota;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function limit(kind: Kind) {
  const raw =
    kind === "chat"
      ? process.env.OKAPI_DAILY_CHAT_LIMIT
      : process.env.OKAPI_DAILY_GENERATE_LIMIT;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return kind === "chat" ? 80 : 40;
}

function maxConcurrentGenerate() {
  const n = Number(process.env.OKAPI_MAX_CONCURRENT_GENERATE);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 3;
}

function bucketFor(key: string): DayBucket {
  const s = state();
  const day = todayUtc();
  const existing = s.byKey.get(key);
  if (!existing || existing.day !== day) {
    const fresh: DayBucket = { day, chat: 0, generate: 0 };
    s.byKey.set(key, fresh);
    return fresh;
  }
  return existing;
}

/** Stable-ish client key from request (user token fragment or IP). */
export function quotaKeyFromRequest(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer && bearer.length > 12) {
    return `u:${bearer.slice(0, 16)}…${bearer.slice(-8)}`;
  }
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
  return `ip:${ip}`;
}

export type QuotaDecision =
  | { ok: true; remaining: number; limit: number }
  | {
      ok: false;
      reason: "daily" | "busy";
      message: string;
      limit?: number;
      used?: number;
    };

export function checkAndConsumeQuota(
  key: string,
  kind: Kind,
): QuotaDecision {
  const lim = limit(kind);
  const b = bucketFor(key);
  const used = kind === "chat" ? b.chat : b.generate;

  if (used >= lim) {
    return {
      ok: false,
      reason: "daily",
      message:
        "Okapi a atteint la limite du jour pour ta session. Réessaie demain, ou plus tard.",
      limit: lim,
      used,
    };
  }

  if (kind === "generate") {
    const s = state();
    if (s.inFlightGenerate >= maxConcurrentGenerate()) {
      return {
        ok: false,
        reason: "busy",
        message:
          "Okapi est très sollicité. Réessaie dans quelques secondes.",
      };
    }
    s.inFlightGenerate += 1;
    b.generate += 1;
  } else {
    b.chat += 1;
  }

  const nextUsed = kind === "chat" ? b.chat : b.generate;
  return { ok: true, remaining: Math.max(0, lim - nextUsed), limit: lim };
}

export function releaseGenerateSlot() {
  const s = state();
  s.inFlightGenerate = Math.max(0, s.inFlightGenerate - 1);
}

export function quotaExceededResponse(decision: Extract<QuotaDecision, { ok: false }>) {
  return Response.json(
    {
      error: decision.message,
      code: decision.reason === "busy" ? "okapi_busy" : "okapi_quota",
    },
    {
      status: decision.reason === "busy" ? 503 : 429,
      headers: {
        "Retry-After": decision.reason === "busy" ? "8" : "3600",
      },
    },
  );
}
