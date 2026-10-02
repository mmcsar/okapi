import { NextResponse } from "next/server";
import { resolvePublicProjectBySlug } from "@/lib/public-project";
import {
  assertBodySize,
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const resolved = await resolvePublicProjectBySlug(slug || "");
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, setupRequired: resolved.setupRequired },
      { status: resolved.status },
    );
  }

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection")?.trim();

  const admin = getSupabaseAdmin();
  let query = admin
    .from("app_records")
    .select("id, project_id, collection, data, created_at, updated_at")
    .eq("project_id", resolved.project.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (collection) {
    query = query.eq("collection", collection.slice(0, 64));
  }

  const { data, error } = await query;
  if (error) {
    const missing = /app_records|does not exist|Could not find/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Données app non configurées."
          : error.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, records: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
  const tooBig = assertBodySize(request, 64_000);
  if (tooBig) return tooBig;

  const ip = clientIpFromRequest(request);
  const hit = checkRateLimit(`public-records:${ip}`, 40, 15 * 60_000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(hit.retryAfterSec) },
      },
    );
  }

  const { slug } = await ctx.params;
  const resolved = await resolvePublicProjectBySlug(slug || "");
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, setupRequired: resolved.setupRequired },
      { status: resolved.status },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    collection?: string;
    data?: Record<string, unknown>;
  } | null;

  const collection = body?.collection?.trim().slice(0, 64);
  if (!collection) {
    return NextResponse.json(
      { error: "collection requise." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const payload = {
    project_id: resolved.project.id,
    user_id: resolved.project.user_id,
    collection,
    data: body?.data && typeof body.data === "object" ? body.data : {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("app_records")
    .insert(payload)
    .select("id, project_id, collection, data, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, record: data });
}
