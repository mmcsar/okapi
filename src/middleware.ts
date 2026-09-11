import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/admin")) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};
