import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmMobilePaymentByReference } from "@/lib/billing-confirm";
import { assertBodySize } from "@/lib/security";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** Confirmer ou refuser un paiement Mobile Money (session admin). */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const tooBig = assertBodySize(request, 16_000);
  if (tooBig) return tooBig;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Base Okapi non configurée." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    reference?: string;
    status?: "paid" | "failed";
  } | null;

  const reference = body?.reference?.trim();
  if (!reference) {
    return NextResponse.json(
      { error: "Référence manquante." },
      { status: 400 },
    );
  }

  const nextStatus = body?.status === "failed" ? "failed" : "paid";
  const result = await confirmMobilePaymentByReference(
    getSupabaseAdmin(),
    reference,
    nextStatus,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    reference: result.reference,
    status: result.status,
    planId: result.planId,
    periodEnd: result.periodEnd,
    alreadyPaid: result.alreadyPaid,
    message:
      nextStatus === "paid"
        ? "Paiement confirmé — abonnement activé."
        : "Paiement marqué comme échoué.",
  });
}
