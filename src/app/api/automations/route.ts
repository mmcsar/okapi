import { NextResponse } from "next/server";
import { normalizeScheduleKey } from "@/lib/run-automation";
import { assertBodySize } from "@/lib/security";
import {
  AUTOMATION_TEMPLATES,
  getTemplate,
  type AutomationRow,
} from "@/lib/scheduled-tasks";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.session.supabase
    .from("scheduled_tasks")
    .select(
      "id, user_id, template_id, title, schedule_key, enabled, topic, last_run_at, last_result, run_count, created_at, updated_at",
    )
    .eq("user_id", auth.session.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    const missing = /scheduled_tasks|does not exist|Could not find/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Automatisations non configurées. Exécute supabase/migrations/20260319_scheduled_tasks.sql"
          : error.message,
        setupRequired: missing,
        templates: AUTOMATION_TEMPLATES,
        tasks: [] as AutomationRow[],
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    templates: AUTOMATION_TEMPLATES,
    tasks: (data ?? []) as AutomationRow[],
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const tooBig = assertBodySize(request, 20_000);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as {
    templateId?: string;
    scheduleKey?: string;
    topic?: string;
    enabled?: boolean;
  } | null;

  const tpl = getTemplate(body?.templateId?.trim() || "");
  if (!tpl) {
    return NextResponse.json({ error: "Modèle inconnu." }, { status: 400 });
  }

  const scheduleKey = normalizeScheduleKey(
    body?.scheduleKey || tpl.defaultSchedule,
  );
  const topic = body?.topic?.trim().slice(0, 200) || null;

  const payload = {
    user_id: auth.session.user.id,
    template_id: tpl.id,
    title: tpl.title,
    schedule_key: scheduleKey,
    enabled: body?.enabled !== false,
    topic,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.session.supabase
    .from("scheduled_tasks")
    .upsert(payload, { onConflict: "user_id,template_id" })
    .select(
      "id, user_id, template_id, title, schedule_key, enabled, topic, last_run_at, last_result, run_count, created_at, updated_at",
    )
    .single();

  if (error) {
    const missing = /scheduled_tasks|does not exist|Could not find/i.test(
      error.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Automatisations non configurées. Exécute supabase/migrations/20260319_scheduled_tasks.sql"
          : error.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, task: data as AutomationRow });
}
