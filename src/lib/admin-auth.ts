import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE = "okapi_admin_session";

export async function requireAdmin() {
  const jar = await cookies();
  if (jar.get(COOKIE)?.value !== "1") {
    return {
      error: NextResponse.json(
        { error: "Accès admin requis." },
        { status: 401 },
      ),
    } as const;
  }
  return { ok: true as const };
}
