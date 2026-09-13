import { NextResponse } from "next/server";
import { getPlan } from "@/lib/billing";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { data: sub, error: subErr } = await auth.session.supabase
    .from("subscriptions")
    .select(
      "id, plan_id, status, phone, operator, current_period_start, current_period_end, updated_at",
    )
    .eq("user_id", auth.session.user.id)
    .maybeSingle();

  if (subErr) {
    const missing = /relation .*subscriptions.* does not exist|Could not find the table/i.test(
      subErr.message,
    );
    return NextResponse.json(
      {
        error: missing
          ? "Abonnements non configurés. Exécute la migration Mobile Pay dans Supabase."
          : subErr.message,
        setupRequired: missing,
        subscription: null,
        payments: [],
        plan: getPlan("free"),
      },
      { status: missing ? 200 : 500 },
    );
  }

  const { data: payments } = await auth.session.supabase
    .from("mobile_payments")
    .select(
      "id, reference, status, amount_cdf, operator, phone, plan_id, created_at, paid_at",
    )
    .eq("user_id", auth.session.user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const planId = sub?.plan_id || "free";
  const active =
    sub?.status === "active" &&
    (!sub.current_period_end ||
      new Date(sub.current_period_end).getTime() > Date.now());

  return NextResponse.json({
    ok: true,
    subscription: sub
      ? {
          ...sub,
          active,
        }
      : {
          plan_id: "free",
          status: "inactive",
          active: false,
        },
    plan: getPlan(active ? planId : "free") ?? getPlan("free"),
    payments: payments ?? [],
  });
}
