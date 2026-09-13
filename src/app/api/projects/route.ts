import { NextResponse } from "next/server";
import {
  mergeArtifacts,
  pickArtifactPatch,
  PROJECT_SELECT,
  type OkapiArtifacts,
} from "@/lib/project-artifacts";
import { requireUser, type OkapiProject } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.session.supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("user_id", auth.session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    // Fallback if artifacts column not migrated yet
    if (/artifacts|column/i.test(error.message)) {
      const legacy = await auth.session.supabase
        .from("projects")
        .select(
          "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug, backend_sql, backend_api, backend_readme",
        )
        .eq("user_id", auth.session.user.id)
        .order("updated_at", { ascending: false });
      if (legacy.error) {
        const missing =
          /relation .*projects.* does not exist|Could not find the table/i.test(
            legacy.error.message,
          );
        return NextResponse.json(
          {
            error: missing
              ? "Sauvegarde projets indisponible. Contacte le support Okapi."
              : legacy.error.message,
            setupRequired: missing,
          },
          { status: missing ? 503 : 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        projects: (legacy.data ?? []) as OkapiProject[],
      });
    }

    const missing = /relation .*projects.* does not exist|Could not find the table/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Sauvegarde projets indisponible. Contacte le support Okapi."
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
    artifacts?: OkapiArtifacts;
    sql?: string;
    api?: string;
    readme?: string;
  } | null;

  const title = body?.title?.trim() || "Nouveau projet Okapi";
  const sector = body?.sector?.trim() || "Site web";
  const html = body?.html ?? "";
  const summary = body?.summary?.trim() || null;
  const artifacts = mergeArtifacts(
    {},
    {
      ...pickArtifactPatch(body?.artifacts),
      ...(body?.sql !== undefined ? { sql: body.sql } : {}),
      ...(body?.api !== undefined ? { api: body.api } : {}),
      ...(body?.readme !== undefined ? { readme: body.readme } : {}),
    },
  );

  const insertRow: Record<string, unknown> = {
    user_id: auth.session.user.id,
    title,
    sector,
    html,
    summary,
    artifacts,
    backend_sql: artifacts.sql ?? null,
    backend_api: artifacts.api ?? null,
    backend_readme: artifacts.readme ?? null,
  };

  let { data, error } = await auth.session.supabase
    .from("projects")
    .insert(insertRow)
    .select(PROJECT_SELECT)
    .single();

  if (error && /artifacts|column/i.test(error.message)) {
    delete insertRow.artifacts;
    const legacy = await auth.session.supabase
      .from("projects")
      .insert(insertRow)
      .select(
        "id, user_id, title, sector, html, summary, created_at, updated_at, is_public, share_slug, backend_sql, backend_api, backend_readme",
      )
      .single();
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, project: data as OkapiProject });
}
