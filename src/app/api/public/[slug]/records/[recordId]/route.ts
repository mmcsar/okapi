import { NextResponse } from "next/server";
import { resolvePublicProjectBySlug } from "@/lib/public-project";
import {
  assertBodySize,
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; recordId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const tooBig = assertBodySize(request, 64_000);
  if (tooBig) return tooBig;

  const ip = clientIpFromRequest(request);
  const hit = checkRateLimit(`public-records-mut:${ip}`, 40, 15 * 60_000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(hit.retryAfterSec) },
      },
    );
  }

  const { slug, recordId } = await ctx.params;
  const resolved = await resolvePublicProjectBySlug(slug || "");
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    data?: Record<string, unknown>;
  } | null;

  if (!body?.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "data JSON requis." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("app_records")
    .update({
      data: body.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("project_id", resolved.project.id)
    .select("id, project_id, collection, data, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Enregistrement introuvable." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, record: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const ip = clientIpFromRequest(request);
  const hit = checkRateLimit(`public-records-mut:${ip}`, 40, 15 * 60_000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(hit.retryAfterSec) },
      },
    );
  }

  const { slug, recordId } = await ctx.params;
  const resolved = await resolvePublicProjectBySlug(slug || "");
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("app_records")
    .delete()
    .eq("id", recordId)
    .eq("project_id", resolved.project.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
