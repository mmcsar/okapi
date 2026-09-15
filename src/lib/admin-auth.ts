import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/crypto-aes";

export const ADMIN_COOKIE = "okapi_admin_session";

export async function requireAdmin() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const session = verifyAdminSessionToken(token);

  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Accès admin requis." },
        { status: 401 },
      ),
    } as const;
  }
  return { ok: true as const, session };
}
