import { NextResponse } from "next/server";
import { loadUserIntelligenceContext } from "@/lib/okapi-intelligence";
import { patchAfterRun, runAutomationLlm } from "@/lib/run-automation";
import type { AutomationRow } from "@/lib/scheduled-tasks";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;

  const { data: row, error: loadErr } = await auth.session.supabase
    .from("scheduled_tasks")
    .select(
      "id, user_id, template_id, title, schedule_key, enabled, topic, last_run_at, last_result, run_count, created_at, updated_at",
    )
    .eq("id", id)
    .eq("user_id", auth.session.user.id)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Tâche introuvable." }, { status: 404 });
  }

  const task = row as AutomationRow;

  try {
    const intelligenceContext = await loadUserIntelligenceContext(
      auth.session.supabase,
      auth.session.user.id,
    );
    const result = await runAutomationLlm({
      templateId: task.template_id,
      topic: task.topic,
      title: task.title,
      intelligenceContext,
    });
    const patch = patchAfterRun(task, result);

    const { data, error } = await auth.session.supabase
      .from("scheduled_tasks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", auth.session.user.id)
      .select(
        "id, user_id, template_id, title, schedule_key, enabled, topic, last_run_at, last_result, run_count, created_at, updated_at",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, task: data as AutomationRow, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec du run." },
      { status: 502 },
    );
  }
}
