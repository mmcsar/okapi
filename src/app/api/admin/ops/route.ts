import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { formatCdf, getPlan } from "@/lib/billing";
import { openSensitive } from "@/lib/crypto-aes";
import { ID_DOC_OPTIONS, kycStatusLabel } from "@/lib/kyc";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

function docLabel(type: string | null | undefined) {
  return ID_DOC_OPTIONS.find((o) => o.id === type)?.label || type || "—";
}

/**
 * Vue ops MMC : identités à valider, paiements en attente, abonnements.
 */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error: "Base Okapi non configurée (clé service manquante).",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdmin();

  const [idRes, payRes, subRes] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, full_name, phone, city, account_type, id_doc_type, id_doc_number, nif, rccm, kyc_status, kyc_submitted_at, kyc_notes",
      )
      .in("kyc_status", ["pending", "verified", "rejected"])
      .order("kyc_submitted_at", { ascending: false })
      .limit(40),
    admin
      .from("mobile_payments")
      .select(
        "id, user_id, plan_id, amount_cdf, operator, phone, reference, status, created_at, paid_at",
      )
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("subscriptions")
      .select(
        "id, user_id, plan_id, status, phone, operator, current_period_start, current_period_end, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  const missingTable = (msg?: string) =>
    /relation|does not exist|Could not find/i.test(msg || "");

  if (
    missingTable(idRes.error?.message) ||
    missingTable(payRes.error?.message) ||
    missingTable(subRes.error?.message)
  ) {
    return NextResponse.json(
      {
        error:
          "Tables identité / paiements absentes. Exécute les migrations dans le SQL Editor.",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const identities = (idRes.data || []).map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string) || "—",
    phone: (row.phone as string) || "—",
    city: (row.city as string) || "—",
    accountType: row.account_type === "business" ? "Entreprise" : "Particulier",
    idDocType: docLabel(row.id_doc_type as string | null),
    idDocNumber: openSensitive(
      typeof row.id_doc_number === "string" ? row.id_doc_number : null,
    ),
    nif: openSensitive(typeof row.nif === "string" ? row.nif : null),
    rccm: openSensitive(typeof row.rccm === "string" ? row.rccm : null),
    status: row.kyc_status as string,
    statusLabel: kycStatusLabel(row.kyc_status as string),
    submittedAt: row.kyc_submitted_at as string | null,
    notes: (row.kyc_notes as string) || null,
  }));

  const payments = (payRes.data || []).map((row) => {
    const plan = getPlan(row.plan_id as string);
    return {
      id: row.id as string,
      userId: row.user_id as string,
      planId: row.plan_id as string,
      planLabel: plan?.label || (row.plan_id as string),
      amountLabel: formatCdf(row.amount_cdf as number),
      operator: row.operator as string,
      phone: row.phone as string,
      reference: row.reference as string,
      status: row.status as string,
      createdAt: row.created_at as string,
      paidAt: (row.paid_at as string) || null,
    };
  });

  const subscriptions = (subRes.data || []).map((row) => {
    const plan = getPlan(row.plan_id as string);
    return {
      id: row.id as string,
      userId: row.user_id as string,
      planId: row.plan_id as string,
      planLabel: plan?.label || (row.plan_id as string),
      status: row.status as string,
      phone: (row.phone as string) || null,
      operator: (row.operator as string) || null,
      periodStart: (row.current_period_start as string) || null,
      periodEnd: (row.current_period_end as string) || null,
      updatedAt: row.updated_at as string,
    };
  });

  return NextResponse.json({
    ok: true,
    counts: {
      identityPending: identities.filter((i) => i.status === "pending").length,
      paymentsPending: payments.filter((p) => p.status === "pending").length,
      subscriptionsActive: subscriptions.filter((s) => s.status === "active")
        .length,
    },
    identities,
    payments,
    subscriptions,
  });
}
