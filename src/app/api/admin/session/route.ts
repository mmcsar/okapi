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
  assertBodySize,
  assertSameOrigin,
  checkRateLimit,
  clientIpFromRequest,
  isProduction,
} from "@/lib/security";

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
  // Toujours nettoyer l’ancien nom (migration __Host-)
  res.cookies.set(ADMIN_COOKIE_LEGACY, "", {
    ...opts,
    secure: isProduction(),
  });
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 8_000);
  if (tooBig) return tooBig;

  const badOrigin = assertSameOrigin(request);
  if (badOrigin) return badOrigin;

  const ip = clientIpFromRequest(request);
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

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
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

  let token: string;
  try {
    token = createAdminSessionToken();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Impossible de créer la session sécurisée." },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  clearAdminCookies(res);
  res.cookies.set(
    ADMIN_COOKIE,
    token,
    sessionCookieOptions(ADMIN_SESSION_MAX_AGE_SEC),
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
