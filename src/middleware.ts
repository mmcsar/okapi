import { NextRequest, NextResponse } from "next/server";
import {
  applySecurityHeaders,
  checkRateLimit,
  clientIpFromRequest,
  isBlockedPath,
} from "@/lib/security";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isBlockedPath(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Rate limit APIs (anti brute-force / scrape / vol)
  if (pathname.startsWith("/api/")) {
    const ip = clientIpFromRequest(request);
    const isLlm =
      pathname.startsWith("/api/chat") ||
      pathname.startsWith("/api/generate") ||
      pathname.startsWith("/api/studio-edit");
    const isAuthHeavy =
      pathname.startsWith("/api/admin") ||
      pathname.startsWith("/api/projects") ||
      pathname.startsWith("/api/billing") ||
      pathname.startsWith("/api/kyc");

    const limit = isLlm ? 40 : isAuthHeavy ? 120 : 200;
    const windowMs = 60_000;
    const hit = checkRateLimit(`mw:${ip}:${isLlm ? "llm" : "api"}`, limit, windowMs);
    if (!hit.ok) {
      const res = NextResponse.json(
        {
          error:
            "Trop de requêtes. Patiente un moment avant de réessayer.",
          code: "okapi_rate_limit",
        },
        {
          status: 429,
          headers: { "Retry-After": String(hit.retryAfterSec) },
        },
      );
      return applySecurityHeaders(res);
    }
  }

  const res = NextResponse.next();
  applySecurityHeaders(res, {
    isAdmin: pathname.startsWith("/admin"),
  });

  // Ne pas indexer les pages compte / callback
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/admin")
  ) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
