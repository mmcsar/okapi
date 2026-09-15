import { NextResponse } from "next/server";
import { assertBodySize } from "@/lib/security";
import { requireUser } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string }> };

async function assertProjectOwner(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(!error && data);
}

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { projectId } = await ctx.params;
  if (!projectId) {
    return NextResponse.json({ error: "Projet manquant." }, { status: 400 });
  }

  const url = new URL(request.url);
  const collection = url.searchParams.get("collection")?.trim();

  const owns = await assertProjectOwner(
    auth.session.supabase,
    auth.session.user.id,
    projectId,
  );
  if (!owns) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  let query = auth.session.supabase
    .from("app_records")
    .select("id, project_id, collection, data, created_at, updated_at")
    .eq("project_id", projectId)
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
          ? "Données app non configurées. Exécute supabase/migrations/20260315_app_records.sql"
          : error.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, records: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const tooBig = assertBodySize(request, 200_000);
  if (tooBig) return tooBig;

  const { projectId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    collection?: string;
    data?: Record<string, unknown>;
  } | null;

  const collection = body?.collection?.trim().slice(0, 64);
  if (!collection) {
    return NextResponse.json(
      { error: "collection requise (ex: products, orders)." },
      { status: 400 },
    );
  }

  const owns = await assertProjectOwner(
    auth.session.supabase,
    auth.session.user.id,
    projectId,
  );
  if (!owns) {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }

  const payload = {
    project_id: projectId,
    user_id: auth.session.user.id,
    collection,
    data: body?.data && typeof body.data === "object" ? body.data : {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.session.supabase
    .from("app_records")
    .insert(payload)
    .select("id, project_id, collection, data, created_at, updated_at")
    .single();

  if (error) {
    const missing = /app_records|does not exist|Could not find/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Données app non configurées. Exécute supabase/migrations/20260315_app_records.sql"
          : error.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, record: data });
}
