import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_MAX_AGE_SEC,
  adminCodeLooksStrong,
  aesConfigured,
  createAdminSessionToken,
  safeEqualString,
  verifyAdminSessionToken,
} from "@/lib/crypto-aes";
import { ADMIN_COOKIE, ADMIN_COOKIE_LEGACY } from "@/lib/admin-auth";
import {
  confirmAdminMfa,
  createTotpPendingToken,
  ensureAdminMfaSecret,
  readAdminMfa,
  totpQrDataUrl,
  verifyTotp,
  verifyTotpPendingToken,
} from "@/lib/admin-totp";
import {
  assertBodySize,
  assertSameOrigin,
  checkRateLimit,
  clientIpFromRequest,
  isProduction,
} from "@/lib/security";

const TOTP_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-okapi_admin_totp"
    : "okapi_admin_totp";

const TOTP_PENDING_SEC = 5 * 60;

export const runtime = "nodejs";

function sessionCookieOptions(maxAge: number) {
  const secure = isProduction();
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge,
  };
}

function clearAdminCookies(res: NextResponse) {
  const opts = sessionCookieOptions(0);
  res.cookies.set(ADMIN_COOKIE, "", opts);
  res.cookies.set(TOTP_COOKIE, "", opts);
  // Toujours nettoyer l’ancien nom (migration __Host-)
  res.cookies.set(ADMIN_COOKIE_LEGACY, "", {
    ...opts,
    secure: isProduction(),
  });
}

function issueAdminSession() {
  const token = createAdminSessionToken();
  const res = NextResponse.json({ ok: true });
  clearAdminCookies(res);
  res.cookies.set(
    ADMIN_COOKIE,
    token,
    sessionCookieOptions(ADMIN_SESSION_MAX_AGE_SEC),
  );
  return res;
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 8_000);
  if (tooBig) return tooBig;

  const badOrigin = assertSameOrigin(request);
  if (badOrigin) return badOrigin;

  const ip = clientIpFromRequest(request);
  const body = (await request.json().catch(() => null)) as {
    code?: string;
    totp?: string;
  } | null;
  const totp = body?.totp?.replace(/\s/g, "") || "";

  if (totp) {
    const totpHit = checkRateLimit(`admin-totp:${ip}`, 8, 15 * 60_000);
    if (!totpHit.ok) {
      return NextResponse.json(
        { ok: false, error: "Trop de codes. Réessaie plus tard." },
        {
          status: 429,
          headers: { "Retry-After": String(totpHit.retryAfterSec) },
        },
      );
    }
    const jar = await cookies();
    const pending = verifyTotpPendingToken(jar.get(TOTP_COOKIE)?.value);
    if (!pending) {
      return NextResponse.json(
        { ok: false, error: "Le mot de passe a expiré. Recommence." },
        { status: 401 },
      );
    }
    const mfa = await readAdminMfa();
    if (mfa.status !== "ready" || !verifyTotp(mfa.secret, totp)) {
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json(
        { ok: false, error: "Code à 6 chiffres incorrect." },
        { status: 401 },
      );
    }
    if (!mfa.confirmed) {
      const saved = await confirmAdminMfa();
      if (!saved) {
        return NextResponse.json(
          { ok: false, error: "Impossible d’enregistrer le TOTP." },
          { status: 500 },
        );
      }
    }
    try {
      return issueAdminSession();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Impossible de créer la session sécurisée." },
        { status: 500 },
      );
    }
  }

  const hit = checkRateLimit(`admin-login:${ip}`, 5, 15 * 60_000);
  if (!hit.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Trop de tentatives. Réessaie plus tard.",
        code: "okapi_rate_limit",
      },
      {
        status: 429,
        headers: { "Retry-After": String(hit.retryAfterSec) },
      },
    );
  }

  const expected = process.env.OKAPI_ADMIN_CODE?.trim();
  const provided = body?.code?.trim() || "";

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Code admin non configuré sur le serveur." },
      { status: 500 },
    );
  }

  if (!adminCodeLooksStrong(expected)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Code admin trop court (12 caractères minimum).",
      },
      { status: 500 },
    );
  }

  if (!aesConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Chiffrement AES non configuré. Pose OKAPI_AES_KEY (ou OKAPI_SESSION_SECRET) — distinct du code admin.",
      },
      { status: 500 },
    );
  }

  const match =
    Boolean(provided) &&
    provided.length === expected.length &&
    safeEqualString(provided, expected);

  if (!match) {
    // Frein uniforme anti timing / brute-force
    await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 200)));
    return NextResponse.json(
      { ok: false, error: "Code incorrect." },
      { status: 401 },
    );
  }

  const mfa = await ensureAdminMfaSecret();
  if (mfa.status === "missing") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Lance le SQL 20261018_admin_totp.sql dans Supabase, puis recommence.",
      },
      { status: 503 },
    );
  }
  if (mfa.status === "error") {
    return NextResponse.json(
      { ok: false, error: "Le second facteur n’est pas lisible." },
      { status: 500 },
    );
  }
  if (mfa.status === "skip") {
    try {
      return issueAdminSession();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Impossible de créer la session sécurisée." },
        { status: 500 },
      );
    }
  }
  if (mfa.status !== "ready") {
    return NextResponse.json(
      { ok: false, error: "Le second facteur n’est pas prêt." },
      { status: 500 },
    );
  }

  let qrDataUrl = "";
  if (!mfa.confirmed) {
    try {
      qrDataUrl = await totpQrDataUrl(mfa.secret);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Impossible de créer le QR code." },
        { status: 500 },
      );
    }
  }

  const res = NextResponse.json(
    mfa.confirmed
      ? { ok: false, step: "totp", phone: mfa.phone }
      : {
          ok: false,
          step: "setup",
          phone: mfa.phone,
          qrDataUrl,
          manualKey: mfa.secret,
        },
  );
  res.cookies.set(
    TOTP_COOKIE,
    createTotpPendingToken(),
    sessionCookieOptions(TOTP_PENDING_SEC),
  );
  return res;
}

export async function DELETE(request: Request) {
  const badOrigin = assertSameOrigin(request);
  if (badOrigin) return badOrigin;

  const res = NextResponse.json({ ok: true });
  clearAdminCookies(res);
  return res;
}

export async function GET() {
  const jar = await cookies();
  const token =
    jar.get(ADMIN_COOKIE)?.value || jar.get(ADMIN_COOKIE_LEGACY)?.value;
  const session = verifyAdminSessionToken(token);
  return NextResponse.json({
    ok: Boolean(session),
  });
}
