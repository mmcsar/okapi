import { NextResponse } from "next/server";
import { normalizeDrPhone } from "@/lib/billing";
import { openSensitive, sealSensitive } from "@/lib/crypto-aes";
import {
  validateKycInput,
  type AccountType,
  type IdDocType,
} from "@/lib/kyc";
import { assertBodySize } from "@/lib/security";
import { requireUser } from "@/lib/supabase";

export const runtime = "nodejs";

function revealKycProfile<T extends Record<string, unknown>>(row: T) {
  return {
    ...row,
    id_doc_number: openSensitive(
      typeof row.id_doc_number === "string" ? row.id_doc_number : null,
    ),
    nif: openSensitive(typeof row.nif === "string" ? row.nif : null),
    rccm: openSensitive(typeof row.rccm === "string" ? row.rccm : null),
  };
}

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
  let sealedDoc: string | null;
  let sealedNif: string | null;
  let sealedRccm: string | null;
  try {
    sealedDoc = sealSensitive(input.idDocNumber);
    sealedNif =
      input.accountType === "business" ? sealSensitive(input.nif) : null;
    sealedRccm =
      input.accountType === "business" ? sealSensitive(input.rccm) : null;
  } catch {
    return NextResponse.json(
      {
        error:
          "Chiffrement AES non configuré. Ajoute OKAPI_AES_KEY sur le serveur.",
      },
      { status: 503 },
    );
  }

  const payload = {
    id: auth.session.user.id,
    full_name: input.fullName,
    display_name: input.fullName.split(" ")[0],
    phone: input.phone,
    city: input.city,
    account_type: input.accountType,
    id_doc_type: input.idDocType,
    // AES-256-GCM at rest — pièce d’identité / NIF / RCCM
    id_doc_number: sealedDoc,
    nif: sealedNif,
    rccm: sealedRccm,
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
    profile: data ? revealKycProfile(data) : data,
    message:
      "KYC envoyé. Tu peux payer — MMC valide ton identité sous peu.",
  });
}
