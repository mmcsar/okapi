import { NextResponse } from "next/server";
import {
  mergeArtifacts,
  normalizeArtifacts,
  pickArtifactPatch,
  PROJECT_SELECT,
  type OkapiArtifacts,
} from "@/lib/project-artifacts";
import { requireUser, type OkapiProject } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  let { data, error } = await auth.session.supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .maybeSingle();

  if (error && /artifacts|column/i.test(error.message)) {
    const legacy = await auth.session.supabase
      .from("projects")
      .select(
        "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug, backend_sql, backend_api, backend_readme",
      )
      .eq("id", id)
      .eq("user_id", auth.session.user.id)
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

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
    artifacts?: OkapiArtifacts;
    sql?: string;
    api?: string;
    readme?: string;
  } | null;

  const patch: Record<string, unknown> = {};
  if (typeof body?.title === "string") {
    patch.title = body.title.trim() || "Projet Okapi";
  }
  if (typeof body?.sector === "string") {
    patch.sector = body.sector.trim() || "Site web";
  }
  if (typeof body?.html === "string") patch.html = body.html;
  if (body && "summary" in body) patch.summary = body.summary?.trim() || null;

  if (body?.artifacts || body?.sql || body?.api || body?.readme) {
    const { data: existing } = await auth.session.supabase
      .from("projects")
      .select("artifacts, backend_sql, backend_api, backend_readme")
      .eq("id", id)
      .eq("user_id", auth.session.user.id)
      .maybeSingle();

    const current = normalizeArtifacts(
      (existing as { artifacts?: unknown } | null)?.artifacts ?? {
        sql: (existing as { backend_sql?: string } | null)?.backend_sql,
        api: (existing as { backend_api?: string } | null)?.backend_api,
        readme: (existing as { backend_readme?: string } | null)?.backend_readme,
      },
    );

    const next = mergeArtifacts(current, {
      ...pickArtifactPatch(body.artifacts),
      ...(body?.sql !== undefined ? { sql: body.sql } : {}),
      ...(body?.api !== undefined ? { api: body.api } : {}),
      ...(body?.readme !== undefined ? { readme: body.readme } : {}),
    });

    patch.artifacts = next;
    patch.backend_sql = next.sql ?? null;
    patch.backend_api = next.api ?? null;
    patch.backend_readme = next.readme ?? null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  let { data, error } = await auth.session.supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .select(PROJECT_SELECT)
    .maybeSingle();

  if (error && /artifacts|column/i.test(error.message)) {
    delete patch.artifacts;
    const legacy = await auth.session.supabase
      .from("projects")
      .update(patch)
      .eq("id", id)
      .eq("user_id", auth.session.user.id)
      .select(
        "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug, backend_sql, backend_api, backend_readme",
      )
      .maybeSingle();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

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
