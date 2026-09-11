import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  clientToInsert,
  rowToClient,
  type AdminClientRow,
} from "@/lib/admin-clients-map";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import type { ClientStage } from "@/data/admin-clients";

export const runtime = "nodejs";

function missingSetup(message: string, status = 503) {
  return NextResponse.json(
    { error: message, setupRequired: true },
    { status },
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (!isSupabaseAdminConfigured()) {
    return missingSetup(
      "Ajoute SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API) dans Vercel / .env.local.",
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("admin_clients")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      const missing = /admin_clients|does not exist|Could not find/i.test(
        error.message,
      );
      return missingSetup(
        missing
          ? "Table admin_clients absente. Exécute supabase/migrations/20260309_admin_clients.sql dans le SQL Editor."
          : error.message,
      );
    }

    const clients = ((data ?? []) as AdminClientRow[]).map(rowToClient);
    return NextResponse.json({ ok: true, clients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur Supabase" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (!isSupabaseAdminConfigured()) {
    return missingSetup(
      "Ajoute SUPABASE_SERVICE_ROLE_KEY dans Vercel / .env.local.",
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    company?: string;
    city?: string;
    stage?: ClientStage;
    owner?: string;
    valueUsd?: number;
    nextAction?: string;
    deadline?: string;
    workloadPct?: number;
    overdueDays?: number;
  } | null;

  const name = body?.name?.trim();
  const company = body?.company?.trim();
  if (!name || !company) {
    return NextResponse.json(
      { error: "Nom et entreprise requis." },
      { status: 400 },
    );
  }

  const deadline =
    body?.deadline?.trim() ||
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("admin_clients")
      .insert(
        clientToInsert({
          name,
          company,
          city: body?.city?.trim() || "Kinshasa",
          stage: body?.stage,
          owner: body?.owner?.trim() || "Christian",
          valueUsd: Number(body?.valueUsd) || 0,
          nextAction: body?.nextAction?.trim() || "Premier contact",
          deadline,
          workloadPct: body?.workloadPct,
          overdueDays: body?.overdueDays,
        }),
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      client: rowToClient(data as AdminClientRow),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur Supabase" },
      { status: 500 },
    );
  }
}
