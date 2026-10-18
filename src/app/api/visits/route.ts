import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import { getUserFromAuthHeader } from "@/lib/supabase";
import {
  assertBodySize,
  assertSameOrigin,
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/security";

export const runtime = "nodejs";

const APP_PATHS = new Set([
  "home",
  "studio",
  "projects",
  "automations",
  "settings",
  "billing",
  "login",
]);

function cleanPath(raw: unknown) {
  if (typeof raw !== "string") return null;
  const path = raw.trim().toLowerCase().slice(0, 80);
  if (APP_PATHS.has(path)) return path;
  const pub = path.match(/^p\/([a-z0-9-]{1,60})$/);
  if (pub) return `p/${pub[1]}`;
  return null;
}

function headerText(request: Request, name: string, max: number) {
  const raw = request.headers.get(name) || "";
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  value = value.replace(/[\u0000-\u001f]/g, "").trim();
  if (!value || value.toLowerCase() === "undefined") return null;
  return value.slice(0, max);
}

function countryCode(request: Request) {
  const code = (request.headers.get("x-vercel-ip-country") || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function visitorKey(request: Request) {
  const ip = clientIpFromRequest(request);
  return createHash("sha256").update(`okapi-visit:${ip}`).digest("hex").slice(0, 24);
}

function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const meta = user.user_metadata?.display_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim().slice(0, 80);
  const email = user.email?.split("@")[0];
  return email ? email.slice(0, 80) : null;
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 2_000);
  if (tooBig) return tooBig;
  const badOrigin = assertSameOrigin(request);
  if (badOrigin) return badOrigin;

  const ip = clientIpFromRequest(request);
  const hit = checkRateLimit(`visit:${ip}`, 30, 10 * 60_000);
  if (!hit.ok) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const path = cleanPath(body?.path);
  if (!path) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const session = await getUserFromAuthHeader(request).catch(() => null);
  const admin = getSupabaseAdmin();
  const key = visitorKey(request);
  const since = new Date(Date.now() - 30 * 60_000).toISOString();

  const existing = await admin
    .from("okapi_visits")
    .select("id, user_id")
    .eq("visitor_key", key)
    .eq("path", path)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const name = session ? displayName(session.user) : null;
  const city =
    headerText(request, "x-vercel-ip-city", 80) ||
    headerText(request, "cf-ipcity", 80);
  const country = countryCode(request);

  if (existing.data) {
    if (!existing.data.user_id && session) {
      await admin
        .from("okapi_visits")
        .update({
          user_id: session.user.id,
          display_name: name,
        })
        .eq("id", existing.data.id);
    }
    return NextResponse.json({ ok: true, deduped: true });
  }

  const inserted = await admin.from("okapi_visits").insert({
    path,
    visitor_key: key,
    user_id: session?.user.id ?? null,
    display_name: name,
    city,
    country,
  });

  if (inserted.error) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  return NextResponse.json({ ok: true });
}
