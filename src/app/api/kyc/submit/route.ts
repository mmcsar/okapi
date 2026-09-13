import { NextResponse } from "next/server";
import { normalizeDrPhone } from "@/lib/billing";
import {
  validateKycInput,
  type AccountType,
  type IdDocType,
} from "@/lib/kyc";
import { assertBodySize } from "@/lib/security";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("error" in auth) return auth.error;

  const tooBig = assertBodySize(request, 32_000);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as {
    fullName?: string;
    phone?: string;
    city?: string;
    accountType?: string;
    idDocType?: string;
    idDocNumber?: string;
    nif?: string;
    rccm?: string;
  } | null;

  const accountType = (
    body?.accountType === "business" ? "business" : "personal"
  ) as AccountType;

  const phone = normalizeDrPhone(body?.phone || "");
  if (!phone) {
    return NextResponse.json(
      {
        error:
          "Numéro invalide. Exemple : 0812 345 678 ou +243 812 345 678",
      },
      { status: 400 },
    );
  }

  const input = {
    fullName: body?.fullName?.trim() || "",
    phone,
    city: body?.city?.trim() || "Kinshasa",
    accountType,
    idDocType: (body?.idDocType || "voter") as IdDocType,
    idDocNumber: body?.idDocNumber?.trim() || "",
    nif: body?.nif?.trim() || "",
    rccm: body?.rccm?.trim() || "",
  };

  const invalid = validateKycInput(input);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = {
    id: auth.session.user.id,
    full_name: input.fullName,
    display_name: input.fullName.split(" ")[0],
    phone: input.phone,
    city: input.city,
    account_type: input.accountType,
    id_doc_type: input.idDocType,
    id_doc_number: input.idDocNumber,
    nif: input.accountType === "business" ? input.nif || null : null,
    rccm: input.accountType === "business" ? input.rccm || null : null,
    kyc_status: "pending",
    kyc_submitted_at: now,
    updated_at: now,
  };

  const { data, error } = await auth.session.supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(
      "id, full_name, phone, city, account_type, id_doc_type, id_doc_number, nif, rccm, kyc_status, kyc_submitted_at, kyc_verified_at",
    )
    .single();

  if (error) {
    const missing = /column|does not exist|Could not find/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "KYC non configuré. Exécute supabase/migrations/20260313_kyc_profiles.sql dans Supabase."
          : error.message,
        setupRequired: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    profile: data,
    message:
      "KYC envoyé. Tu peux payer — MMC valide ton identité sous peu.",
  });
}
