import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmMobilePaymentByReference } from "@/lib/billing-confirm";
import { safeEqualString } from "@/lib/crypto-aes";
import { assertBodySize } from "@/lib/security";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Confirme un paiement Mobile Money (admin MMC ou webhook PSP).
 * Auth : session admin cookie · OU header x-okapi-billing-secret · OU body.adminCode
 */
export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 32_000);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as {
    reference?: string;
    adminCode?: string;
    status?: "paid" | "failed";
  } | null;

  const secret = process.env.OKAPI_BILLING_WEBHOOK_SECRET?.trim() || "";
  const headerSecret =
    request.headers.get("x-okapi-billing-secret")?.trim() || "";
  const adminCode = process.env.OKAPI_ADMIN_CODE?.trim() || "";
  const bodyAdmin = body?.adminCode?.trim() || "";

  const okSecret = Boolean(
    secret && headerSecret && safeEqualString(headerSecret, secret),
  );
  const okAdmin = Boolean(
    adminCode && bodyAdmin && safeEqualString(bodyAdmin, adminCode),
  );
  const session = await requireAdmin();
  const okSession = !("error" in session);

  if (!okSecret && !okAdmin && !okSession) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const reference = body?.reference?.trim();
  if (!reference) {
    return NextResponse.json({ error: "Référence manquante" }, { status: 400 });
  }

  const nextStatus = body?.status === "failed" ? "failed" : "paid";

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Service paiement indisponible." },
      { status: 503 },
    );
  }

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
  });
}
