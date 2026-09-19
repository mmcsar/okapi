import { NextResponse } from "next/server";
import { normalizeScheduleKey } from "@/lib/run-automation";
import { assertBodySize } from "@/lib/security";
import type { AutomationRow } from "@/lib/scheduled-tasks";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const tooBig = assertBodySize(request, 20_000);
  if (tooBig) return tooBig;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean;
    scheduleKey?: string;
    topic?: string | null;
    title?: string;
  } | null;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body?.enabled === "boolean") patch.enabled = body.enabled;
  if (body?.scheduleKey) patch.schedule_key = normalizeScheduleKey(body.scheduleKey);
  if (body?.topic !== undefined) {
    patch.topic =
      typeof body.topic === "string" ? body.topic.trim().slice(0, 200) || null : null;
  }
  if (typeof body?.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 120);
  }

  const { data, error } = await auth.session.supabase
    .from("scheduled_tasks")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .select(
      "id, user_id, template_id, title, schedule_key, enabled, topic, last_run_at, last_result, run_count, created_at, updated_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, task: data as AutomationRow });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const { error } = await auth.session.supabase
    .from("scheduled_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
