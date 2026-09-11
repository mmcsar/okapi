import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  rowToClient,
  type AdminClientRow,
} from "@/lib/admin-clients-map";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";
import type { ClientStage } from "@/data/admin-clients";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Base Okapi non configurée (clé service manquante).",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    stage?: ClientStage;
    name?: string;
    company?: string;
    city?: string;
    owner?: string;
    valueUsd?: number;
    nextAction?: string;
    deadline?: string;
    workloadPct?: number;
    overdueDays?: number;
  } | null;

  const patch: Record<string, unknown> = {};
  if (body?.stage) patch.stage = body.stage;
  if (body?.name?.trim()) patch.name = body.name.trim();
  if (body?.company?.trim()) patch.company = body.company.trim();
  if (body?.city?.trim()) patch.city = body.city.trim();
  if (body?.owner?.trim()) patch.owner = body.owner.trim();
  if (typeof body?.valueUsd === "number") patch.value_usd = body.valueUsd;
  if (body?.nextAction?.trim()) patch.next_action = body.nextAction.trim();
  if (body?.deadline?.trim()) patch.deadline = body.deadline.trim();
  if (typeof body?.workloadPct === "number") {
    patch.workload_pct = body.workloadPct;
  }
  if (typeof body?.overdueDays === "number") {
    patch.overdue_days = body.overdueDays;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("admin_clients")
      .update(patch)
      .eq("id", id)
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
      { error: err instanceof Error ? err.message : "Erreur enregistrement" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Base Okapi non configurée (clé service manquante).",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("admin_clients").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur enregistrement" },
      { status: 500 },
    );
  }
}
