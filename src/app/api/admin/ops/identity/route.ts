import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { assertBodySize } from "@/lib/security";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** Valider ou refuser une identité utilisateur (MMC). */
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
    userId?: string;
    action?: "verified" | "rejected";
    notes?: string;
  } | null;

  const userId = body?.userId?.trim();
  const action = body?.action;
  if (!userId || (action !== "verified" && action !== "rejected")) {
    return NextResponse.json(
      { error: "Paramètres invalides (userId + action)." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("profiles")
    .update({
      kyc_status: action,
      kyc_verified_at: action === "verified" ? now : null,
      kyc_notes: body?.notes?.trim()?.slice(0, 500) || null,
      updated_at: now,
    })
    .eq("id", userId)
    .select("id, kyc_status, full_name")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Profil introuvable." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: data.id,
    status: data.kyc_status,
    message:
      action === "verified"
        ? "Identité validée."
        : "Identité refusée — l’utilisateur doit corriger.",
  });
}
