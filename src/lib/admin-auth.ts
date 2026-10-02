import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdminSessionToken } from "@/lib/crypto-aes";

/** Cookie scoped : __Host- en prod (Secure + Path=/ + pas de Domain). */
export const ADMIN_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-okapi_admin_session"
    : "okapi_admin_session";

/** Ancien nom — lu puis effacé au logout. */
export const ADMIN_COOKIE_LEGACY = "okapi_admin_session";

export async function requireAdmin() {
  const jar = await cookies();
  const token =
    jar.get(ADMIN_COOKIE)?.value || jar.get(ADMIN_COOKIE_LEGACY)?.value;
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
