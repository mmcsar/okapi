import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_MAX_AGE_SEC,
  aesConfigured,
  createAdminSessionToken,
  safeEqualString,
  verifyAdminSessionToken,
} from "@/lib/crypto-aes";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { assertBodySize, checkRateLimit, clientIpFromRequest } from "@/lib/security";

export const runtime = "nodejs";

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 8_000);
  if (tooBig) return tooBig;

  const ip = clientIpFromRequest(request);
  const hit = checkRateLimit(`admin-login:${ip}`, 8, 15 * 60_000);
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

  if (!aesConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Chiffrement AES non configuré (OKAPI_AES_KEY).",
      },
      { status: 500 },
    );
  }

  if (!provided || !safeEqualString(provided, expected)) {
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

  const res = NextResponse.json({ ok: true, encrypted: true, algo: "AES-256-GCM" });
  res.cookies.set(
    ADMIN_COOKIE,
    token,
    sessionCookieOptions(ADMIN_SESSION_MAX_AGE_SEC),
  );
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", sessionCookieOptions(0));
  return res;
}

export async function GET() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const session = verifyAdminSessionToken(token);
  return NextResponse.json({
    ok: Boolean(session),
    encrypted: Boolean(session),
  });
}
