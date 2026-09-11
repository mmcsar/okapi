import { NextResponse } from "next/server";
import { requireUser, type OkapiProject } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const { data, error } = await auth.session.supabase
    .from("projects")
    .select("id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug")
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project: data as OkapiProject });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    sector?: string;
    html?: string;
    summary?: string | null;
  } | null;

  const patch: Record<string, string | null | boolean> = {};
  if (typeof body?.title === "string") patch.title = body.title.trim() || "Projet Okapi";
  if (typeof body?.sector === "string") patch.sector = body.sector.trim() || "Site web";
  if (typeof body?.html === "string") patch.html = body.html;
  if (body && "summary" in body) patch.summary = body.summary?.trim() || null;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.session.supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .select("id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project: data as OkapiProject });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const { error } = await auth.session.supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
