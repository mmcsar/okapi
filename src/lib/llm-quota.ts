/**
 * Quotas LLM Okapi — protection budget / charge.
 * Free / invité: plafonds bas. Payant: plafonds hauts.
 * Mémoire process (Vercel: best-effort par instance).
 * Prochaine étape: table usage_daily / Redis.
 */

type Kind = "chat" | "generate";

export type QuotaTier = "free" | "paid";

type DayBucket = {
  day: string; // YYYY-MM-DD UTC
  chat: number;
  generate: number;
};

type InFlightSlot = {
  startedAt: number;
};

type GlobalQuotaState = {
  byKey: Map<string, DayBucket>;
  /** Slots generate en cours — libérés via releaseGenerateSlot ou TTL. */
  inFlight: InFlightSlot[];
};

declare global {
  // eslint-disable-next-line no-var
  var __okapiLlmQuota: GlobalQuotaState | undefined;
}

function state(): GlobalQuotaState {
  if (!globalThis.__okapiLlmQuota) {
    globalThis.__okapiLlmQuota = {
      byKey: new Map(),
      inFlight: [],
    };
  }
  const s = globalThis.__okapiLlmQuota as GlobalQuotaState & {
    inFlightGenerate?: number;
  };
  // Compat hot-reload : ancienne forme inFlightGenerate
  if (!Array.isArray(s.inFlight)) {
    s.inFlight = [];
    delete s.inFlightGenerate;
  }
  return s;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name]);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallback;
}

/** Free / invité — bas pour protéger le budget Opus. */
function freeLimit(kind: Kind) {
  return kind === "chat"
    ? envInt("OKAPI_FREE_DAILY_CHAT_LIMIT", 20)
    : envInt("OKAPI_FREE_DAILY_GENERATE_LIMIT", 6);
}

/** Abonnés — plafonds historiques. */
function paidLimit(kind: Kind) {
  return kind === "chat"
    ? envInt("OKAPI_DAILY_CHAT_LIMIT", 80)
    : envInt("OKAPI_DAILY_GENERATE_LIMIT", 40);
}

function limit(kind: Kind, tier: QuotaTier) {
  return tier === "paid" ? paidLimit(kind) : freeLimit(kind);
}

function maxConcurrentGenerate() {
  const n = Number(process.env.OKAPI_MAX_CONCURRENT_GENERATE);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  // Dev local : plus large (évite faux « très sollicité » après quelques essais)
  if (process.env.NODE_ENV !== "production") return 8;
  return 4;
}

/** Expire les slots jamais libérés (crash stream / oubli release). */
const SLOT_TTL_MS = 4 * 60_000;

function pruneStaleSlots() {
  const s = state();
  const now = Date.now();
  s.inFlight = s.inFlight.filter((slot) => now - slot.startedAt < SLOT_TTL_MS);
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
  const ip =
    fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anon";
  return `ip:${ip}`;
}

export type QuotaDecision =
  | { ok: true; remaining: number; limit: number; tier: QuotaTier }
  | {
      ok: false;
      reason: "daily" | "busy";
      message: string;
      limit?: number;
      used?: number;
      tier?: QuotaTier;
    };

export function checkAndConsumeQuota(
  key: string,
  kind: Kind,
  opts?: { paid?: boolean },
): QuotaDecision {
  const tier: QuotaTier = opts?.paid ? "paid" : "free";
  const lim = limit(kind, tier);
  const b = bucketFor(key);
  const used = kind === "chat" ? b.chat : b.generate;

  if (used >= lim) {
    return {
      ok: false,
      reason: "daily",
      message:
        tier === "free"
          ? "Limite gratuite du jour atteinte. Passe à Entreprise Plus pour plus de requêtes, ou réessaie demain."
          : "Okapi a atteint la limite du jour pour ta session. Réessaie demain, ou plus tard.",
      limit: lim,
      used,
      tier,
    };
  }

  if (kind === "generate") {
    pruneStaleSlots();
    const s = state();
    if (s.inFlight.length >= maxConcurrentGenerate()) {
      return {
        ok: false,
        reason: "busy",
        message:
          "Okapi est très sollicité. Réessaie dans quelques secondes.",
        tier,
      };
    }
    s.inFlight.push({ startedAt: Date.now() });
    b.generate += 1;
  } else {
    b.chat += 1;
  }

  const nextUsed = kind === "chat" ? b.chat : b.generate;
  return {
    ok: true,
    remaining: Math.max(0, lim - nextUsed),
    limit: lim,
    tier,
  };
}

export function releaseGenerateSlot() {
  const s = state();
  if (s.inFlight.length > 0) {
    s.inFlight.shift();
  }
}

export function quotaExceededResponse(
  decision: Extract<QuotaDecision, { ok: false }>,
) {
  return Response.json(
    {
      error: decision.message,
      code: decision.reason === "busy" ? "okapi_busy" : "okapi_quota",
      tier: decision.tier,
    },
    {
      status: decision.reason === "busy" ? 503 : 429,
      headers: {
        "Retry-After": decision.reason === "busy" ? "8" : "3600",
      },
    },
  );
}
