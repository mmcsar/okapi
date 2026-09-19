import { NextResponse } from "next/server";
import { safeEqualString } from "@/lib/crypto-aes";
import { loadUserIntelligenceContext } from "@/lib/okapi-intelligence";
import { patchAfterRun, runAutomationLlm } from "@/lib/run-automation";
import {
  isAutomationDue,
  type AutomationRow,
  type ScheduleKey,
} from "@/lib/scheduled-tasks";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(request: Request) {
  const secret =
    process.env.OKAPI_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.headers.get("x-okapi-cron-secret")?.trim() ||
    "";
  if (secret && header && safeEqualString(header, secret)) return true;
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.OKAPI_CRON_ALLOW_DEV === "1"
  ) {
    return true;
  }
  return false;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin non configuré." },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("scheduled_tasks")
    .select(
      "id, user_id, template_id, title, schedule_key, enabled, topic, last_run_at, last_result, run_count, created_at, updated_at",
    )
    .eq("enabled", true)
    .neq("schedule_key", "manual")
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = ((data ?? []) as AutomationRow[]).filter((t) =>
    isAutomationDue({
      scheduleKey: t.schedule_key as ScheduleKey,
      enabled: t.enabled,
      lastRunAt: t.last_run_at,
    }),
  );

  const memoryCache = new Map<string, string>();
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const task of due.slice(0, 20)) {
    try {
      let intelligenceContext = memoryCache.get(task.user_id);
      if (!intelligenceContext) {
        intelligenceContext = await loadUserIntelligenceContext(
          admin,
          task.user_id,
        );
        memoryCache.set(task.user_id, intelligenceContext);
      }
      const text = await runAutomationLlm({
        templateId: task.template_id,
        topic: task.topic,
        title: task.title,
        intelligenceContext,
      });
      const patch = patchAfterRun(task, text);
      const { error: upErr } = await admin
        .from("scheduled_tasks")
        .update(patch)
        .eq("id", task.id);
      results.push({
        id: task.id,
        ok: !upErr,
        error: upErr?.message,
      });
    } catch (err) {
      results.push({
        id: task.id,
        ok: false,
        error: err instanceof Error ? err.message : "fail",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: (data ?? []).length,
    due: due.length,
    ran: results.length,
    results,
  });
}
