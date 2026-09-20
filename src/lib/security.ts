import { NextResponse } from "next/server";

/** Security headers for all Okapi responses. */
export function applySecurityHeaders(
  res: NextResponse,
  opts?: { isAdmin?: boolean },
) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );

  // CSP: autorise preview iframe srcDoc + Monaco CDN workers si besoin
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Next.js + Monaco nécessitent souvent inline/eval en prod bundlée
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "child-src 'self' blob:",
    "frame-src 'self' blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openrouter.ai https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com",
    "upgrade-insecure-requests",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);

  if (opts?.isAdmin) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.headers.set("Cache-Control", "no-store");
  }

  return res;
}

/** Paths that must never be exposed publicly. */
export function isBlockedPath(pathname: string) {
  const p = pathname.toLowerCase();
  if (p.includes("..")) return true;
  if (p.startsWith("/.env") || p.startsWith("/.git")) return true;
  if (p.includes("/node_modules") || p.includes("/.aws")) return true;
  if (p.endsWith(".map")) return true;
  if (p.endsWith(".ts") && !p.startsWith("/api/")) return true;
  if (p.includes("wp-admin") || p.includes("phpmyadmin")) return true;
  if (p.includes("credentials") && !p.startsWith("/api/")) return true;
  return false;
}

/** Simple sliding window rate limit (per process / edge isolate). */
type HitBucket = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __okapiRateLimit: Map<string, HitBucket> | undefined;
}

function rateMap() {
  if (!globalThis.__okapiRateLimit) {
    globalThis.__okapiRateLimit = new Map();
  }
  return globalThis.__okapiRateLimit;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const map = rateMap();
  const cur = map.get(key);
  if (!cur || now >= cur.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (cur.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }
  cur.count += 1;
  return { ok: true };
}

export function clientIpFromRequest(request: Request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return (
    fwd.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Reject oversized JSON bodies early (bytes estimate from Content-Length). */
export function assertBodySize(
  request: Request,
  maxBytes: number,
): NextResponse | null {
  const len = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(len) && len > maxBytes) {
    return NextResponse.json(
      { error: "Requête trop volumineuse." },
      { status: 413 },
    );
  }
  return null;
}

/** Strip secrets / paths from error text before sending to clients. */
export function sanitizePublicError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[redacted]")
    .replace(/sk-or-v1-[a-zA-Z0-9]+/g, "[redacted]")
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/\/Users\/[^\s]+/g, "[path]")
    .replace(/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE|OPENROUTER_API_KEY|OKAPI_AES_KEY|OKAPI_SESSION_SECRET|OKAPI_ADMIN_CODE|OKAPI_BILLING_WEBHOOK_SECRET/gi, "[secret]")
    .replace(/\bopenrouter\.ai\b/gi, "Okapi")
    .replace(/\bopenrouter\b/gi, "Okapi")
    .replace(/\bpollinations(\.ai)?\b/gi, "Okapi")
    .replace(/\bopenai\b/gi, "Okapi")
    .replace(/\bgemini\b/gi, "Okapi")
    .slice(0, 400);
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

/** Test/debug API routes disabled in production unless explicitly allowed. */
export function testRoutesAllowed() {
  if (!isProduction()) return true;
  return process.env.OKAPI_ALLOW_TEST_ROUTES === "1";
}
