import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { formatCdf, getPlan } from "@/lib/billing";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Synthèse admin MMC : comptes, projets, paiements, CRM.
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
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesCount,
    profilesWeek,
    projectsCount,
    projectsToday,
    projectsWeek,
    subsActive,
    kycPending,
    paymentsPending,
    paymentsPaid,
    clientsRes,
    recentProfiles,
    recentProjects,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    admin.from("projects").select("id", { count: "exact", head: true }),
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo),
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("kyc_status", "pending"),
    admin
      .from("mobile_payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("mobile_payments")
      .select("amount_cdf, plan_id, status, paid_at, created_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(200),
    admin.from("admin_clients").select("id, stage, value_usd"),
    admin
      .from("profiles")
      .select("id, display_name, full_name, city, kyc_status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("projects")
      .select("id, title, sector, updated_at, created_at, user_id")
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  const missing = (msg?: string) =>
    /relation|does not exist|Could not find|column/i.test(msg || "");

  // profiles.created_at may be missing on older schemas — ignore soft errors
  const soft = (...errs: (string | undefined)[]) =>
    errs.some((m) => missing(m));

  if (
    soft(
      profilesCount.error?.message,
      projectsCount.error?.message,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Tables profils / projets absentes. Exécute les migrations dans le SQL Editor.",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const paidRows = paymentsPaid.data || [];
  const revenueCdf = paidRows.reduce(
    (sum, row) => sum + (Number(row.amount_cdf) || 0),
    0,
  );
  const revenueWeekCdf = paidRows
    .filter((row) => {
      const when = (row.paid_at || row.created_at) as string | null;
      return when && when >= weekAgo;
    })
    .reduce((sum, row) => sum + (Number(row.amount_cdf) || 0), 0);

  const clients = clientsRes.data || [];
  const clientsByStage = {
    prospect: clients.filter((c) => c.stage === "prospect").length,
    qualified: clients.filter((c) => c.stage === "qualified").length,
    proposal: clients.filter((c) => c.stage === "proposal").length,
    active: clients.filter((c) => c.stage === "active").length,
  };
  const pipelineUsd = clients.reduce(
    (sum, c) => sum + (Number(c.value_usd) || 0),
    0,
  );

  const recentUsers = (recentProfiles.data || []).map((row) => ({
    id: row.id as string,
    name:
      (row.full_name as string) ||
      (row.display_name as string) ||
      "Compte Okapi",
    city: (row.city as string) || "—",
    kycStatus: (row.kyc_status as string) || "none",
    createdAt: (row.created_at as string) || null,
  }));

  const recentApps = (recentProjects.data || []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) || "Sans titre",
    sector: (row.sector as string) || "—",
    updatedAt: (row.updated_at as string) || (row.created_at as string),
  }));

  const planMix: Record<string, number> = {};
  for (const row of paidRows) {
    const plan = getPlan(row.plan_id as string);
    const label = plan?.label || (row.plan_id as string) || "Autre";
    planMix[label] = (planMix[label] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    counts: {
      users: profilesCount.count ?? 0,
      usersWeek: profilesWeek.error ? 0 : profilesWeek.count ?? 0,
      projects: projectsCount.count ?? 0,
      projectsToday: projectsToday.error ? 0 : projectsToday.count ?? 0,
      projectsWeek: projectsWeek.error ? 0 : projectsWeek.count ?? 0,
      subscriptionsActive: subsActive.error ? 0 : subsActive.count ?? 0,
      kycPending: kycPending.error ? 0 : kycPending.count ?? 0,
      paymentsPending: paymentsPending.error ? 0 : paymentsPending.count ?? 0,
      paymentsPaid: paidRows.length,
      clients: clients.length,
      clientsByStage,
      pipelineUsd,
      revenueCdf,
      revenueWeekCdf,
      revenueLabel: formatCdf(revenueCdf),
      revenueWeekLabel: formatCdf(revenueWeekCdf),
    },
    planMix,
    recentUsers,
    recentProjects: recentApps,
  });
}
