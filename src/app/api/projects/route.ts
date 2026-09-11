import { NextResponse } from "next/server";
import { requireUser, type OkapiProject } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.session.supabase
    .from("projects")
    .select("id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug")
    .eq("user_id", auth.session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    const missing = /relation .*projects.* does not exist|Could not find the table/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Table projects absente. Exécute supabase/migrations/20260309_okapi_fullstack.sql dans le SQL Editor Supabase."
          : error.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    projects: (data ?? []) as OkapiProject[],
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    sector?: string;
    html?: string;
    summary?: string;
  } | null;

  const title = body?.title?.trim() || "Nouveau projet Okapi";
  const sector = body?.sector?.trim() || "Site web";
  const html = body?.html ?? "";
  const summary = body?.summary?.trim() || null;

  const { data, error } = await auth.session.supabase
    .from("projects")
    .insert({
      user_id: auth.session.user.id,
      title,
      sector,
      html,
      summary,
    })
    .select("id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project: data as OkapiProject });
}
