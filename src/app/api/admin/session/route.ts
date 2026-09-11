import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE = "okapi_admin_session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const expected = process.env.OKAPI_ADMIN_CODE?.trim();
  const provided = body?.code?.trim();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Code admin non configuré sur le serveur." },
      { status: 500 },
    );
  }

  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Code incorrect." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET() {
  const jar = await cookies();
  const ok = jar.get(COOKIE)?.value === "1";
  return NextResponse.json({ ok });
}
