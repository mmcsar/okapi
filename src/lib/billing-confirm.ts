import { getPlan } from "@/lib/billing";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Confirme ou refuse un paiement Mobile Money (logique partagée webhook / admin UI). */
export async function confirmMobilePaymentByReference(
  admin: SupabaseClient,
  reference: string,
  nextStatus: "paid" | "failed",
) {
  const { data: payment, error } = await admin
    .from("mobile_payments")
    .select("id, user_id, plan_id, status, subscription_id")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !payment) {
    return {
      ok: false as const,
      status: 404,
      error: error?.message || "Paiement introuvable",
    };
  }

  if (payment.status === "paid" && nextStatus === "paid") {
    return {
      ok: true as const,
      alreadyPaid: true,
      reference,
      status: "paid" as const,
      planId: payment.plan_id,
      periodEnd: null as string | null,
    };
  }

  const now = new Date();
  const plan = getPlan(payment.plan_id);
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + (plan?.periodDays || 30));

  const { error: payUpd } = await admin
    .from("mobile_payments")
    .update({
      status: nextStatus,
      paid_at: nextStatus === "paid" ? now.toISOString() : null,
      updated_at: now.toISOString(),
    })
    .eq("id", payment.id);

  if (payUpd) {
    return { ok: false as const, status: 500, error: payUpd.message };
  }

  if (nextStatus === "paid") {
    const { error: subUpd } = await admin.from("subscriptions").upsert(
      {
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (subUpd) {
      return { ok: false as const, status: 500, error: subUpd.message };
    }
  }

  return {
    ok: true as const,
    alreadyPaid: false,
    reference,
    status: nextStatus,
    planId: payment.plan_id,
    periodEnd: nextStatus === "paid" ? periodEnd.toISOString() : null,
  };
}
