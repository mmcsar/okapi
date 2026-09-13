import { NextResponse } from "next/server";
import {
  getPlan,
  normalizeDrPhone,
  type MobileOperator,
  type OkapiPlanId,
} from "@/lib/billing";
import { billingWhatsappUrl, startMobileCheckout } from "@/lib/mobile-pay";
import { requireUser } from "@/lib/supabase";
import { assertBodySize } from "@/lib/security";

export const runtime = "nodejs";

const OPERATORS = new Set<MobileOperator>(["mpesa", "orange", "airtel"]);

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const tooBig = assertBodySize(request, 32_000);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as {
    planId?: string;
    operator?: string;
    phone?: string;
  } | null;

  const planId = (body?.planId || "") as OkapiPlanId;
  const operator = (body?.operator || "") as MobileOperator;
  const plan = getPlan(planId);

  if (!plan || plan.id === "free") {
    return NextResponse.json(
      { error: "Choisis un plan payant (Pro mensuel ou annuel)." },
      { status: 400 },
    );
  }
  if (!OPERATORS.has(operator)) {
    return NextResponse.json(
      { error: "Opérateur invalide (M-Pesa, Orange ou Airtel)." },
      { status: 400 },
    );
  }

  const phone = normalizeDrPhone(body?.phone || "");
  if (!phone) {
    return NextResponse.json(
      {
        error:
          "Numéro Mobile Money invalide. Ex. 0812 345 678 ou +243 812 345 678",
      },
      { status: 400 },
    );
  }

  try {
    const checkout = await startMobileCheckout({
      planId: plan.id,
      operator,
      phone,
      amountCdf: plan.priceCdf,
      userId: auth.session.user.id,
    });

    const { data: subRow, error: subErr } = await auth.session.supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: auth.session.user.id,
          plan_id: plan.id,
          status: "pending",
          phone,
          operator,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();

    if (subErr) {
      const missing = /relation .*subscriptions.* does not exist|Could not find the table/i.test(
        subErr.message,
      );
      return NextResponse.json(
        {
          error: missing
            ? "Table abonnements absente. Exécute supabase/migrations/20260313_mobile_pay.sql dans Supabase."
            : subErr.message,
          setupRequired: missing,
        },
        { status: missing ? 503 : 500 },
      );
    }

    const { data: payRow, error: payErr } = await auth.session.supabase
      .from("mobile_payments")
      .insert({
        user_id: auth.session.user.id,
        subscription_id: subRow?.id ?? null,
        plan_id: plan.id,
        amount_cdf: plan.priceCdf,
        currency: "CDF",
        operator,
        phone,
        reference: checkout.reference,
        status: checkout.status,
        provider: checkout.provider,
        provider_ref: checkout.providerRef ?? null,
        meta: {
          ussdHint: checkout.ussdHint,
          message: checkout.message,
        },
        updated_at: new Date().toISOString(),
      })
      .select(
        "id, reference, status, amount_cdf, operator, phone, plan_id, created_at",
      )
      .single();

    if (payErr) {
      const missing = /relation .*mobile_payments.* does not exist|Could not find the table/i.test(
        payErr.message,
      );
      return NextResponse.json(
        {
          error: missing
            ? "Table paiements absente. Exécute supabase/migrations/20260313_mobile_pay.sql dans Supabase."
            : payErr.message,
          setupRequired: missing,
        },
        { status: missing ? 503 : 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      payment: payRow,
      message: checkout.message,
      ussdHint: checkout.ussdHint,
      whatsappUrl: billingWhatsappUrl(checkout.reference),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Paiement impossible" },
      { status: 400 },
    );
  }
}
