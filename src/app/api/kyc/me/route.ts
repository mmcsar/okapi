import { NextResponse } from "next/server";
import { normalizeDrPhone } from "@/lib/billing";
import {
  kycIsReady,
  kycStatusLabel,
  type KycProfile,
} from "@/lib/kyc";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

const SELECT =
  "id, full_name, phone, city, account_type, id_doc_type, id_doc_number, nif, rccm, kyc_status, kyc_submitted_at, kyc_verified_at";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.session.supabase
    .from("profiles")
    .select(SELECT)
    .eq("id", auth.session.user.id)
    .maybeSingle();

  if (error) {
    const missing = /column|does not exist|Could not find/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "KYC non configuré. Exécute supabase/migrations/20260313_kyc_profiles.sql dans Supabase."
          : error.message,
        setupRequired: missing,
        profile: null,
        kycReady: false,
      },
      { status: missing ? 200 : 500 },
    );
  }

  const profile = (data as KycProfile | null) ?? null;
  return NextResponse.json({
    ok: true,
    profile,
    kycReady: kycIsReady(profile?.kyc_status),
    kycLabel: kycStatusLabel(profile?.kyc_status),
  });
}
