import { NextResponse } from "next/server";
import { getPlan } from "@/lib/billing";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase-admin";
import { assertBodySize } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Confirme un paiement Mobile Pay (admin MMC ou webhook PSP).
 * Header: x-okapi-billing-secret = OKAPI_BILLING_WEBHOOK_SECRET
 * ou body.adminCode = OKAPI_ADMIN_CODE
 */
export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 32_000);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as {
    reference?: string;
    adminCode?: string;
    status?: "paid" | "failed";
  } | null;

  const secret = process.env.OKAPI_BILLING_WEBHOOK_SECRET?.trim();
  const headerSecret = request.headers.get("x-okapi-billing-secret")?.trim();
  const adminCode = process.env.OKAPI_ADMIN_CODE?.trim();
  const okSecret = Boolean(secret && headerSecret && headerSecret === secret);
  const okAdmin = Boolean(
    adminCode && body?.adminCode && body.adminCode === adminCode,
  );

  if (!okSecret && !okAdmin) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const reference = body?.reference?.trim();
  if (!reference) {
    return NextResponse.json({ error: "Référence manquante" }, { status: 400 });
  }

  const nextStatus = body?.status === "failed" ? "failed" : "paid";

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquante" },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: payment, error } = await admin
    .from("mobile_payments")
    .select("id, user_id, plan_id, status, subscription_id")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !payment) {
    return NextResponse.json(
      { error: error?.message || "Paiement introuvable" },
      { status: 404 },
    );
  }

  if (payment.status === "paid" && nextStatus === "paid") {
    return NextResponse.json({ ok: true, alreadyPaid: true, reference });
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
    return NextResponse.json({ error: payUpd.message }, { status: 500 });
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
      return NextResponse.json({ error: subUpd.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    reference,
    status: nextStatus,
    planId: payment.plan_id,
    periodEnd: nextStatus === "paid" ? periodEnd.toISOString() : null,
  });
}
