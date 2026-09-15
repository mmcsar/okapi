import { NextResponse } from "next/server";
import { assertBodySize } from "@/lib/security";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectId: string; recordId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const tooBig = assertBodySize(request, 200_000);
  if (tooBig) return tooBig;

  const { projectId, recordId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    data?: Record<string, unknown>;
  } | null;

  if (!body?.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "data JSON requis." }, { status: 400 });
  }

  const { data, error } = await auth.session.supabase
    .from("app_records")
    .update({
      data: body.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("project_id", projectId)
    .eq("user_id", auth.session.user.id)
    .select("id, project_id, collection, data, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Enregistrement introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, record: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { projectId, recordId } = await ctx.params;

  const { error } = await auth.session.supabase
    .from("app_records")
    .delete()
    .eq("id", recordId)
    .eq("project_id", projectId)
    .eq("user_id", auth.session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
