export const runtime = "nodejs";

type HeygenSummary = {
  ok: boolean;
  name: string;
  email?: string;
  billingType?: string;
  walletBalance?: number;
  planCredits?: number;
  message: string;
};

export async function GET() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) {
    return Response.json(
      { ok: false, error: "HEYGEN_API_KEY manquante dans .env.local" },
      { status: 500 },
    );
  }

  const headers = {
    Accept: "application/json",
    "X-Api-Key": key,
  };

  try {
    const meRes = await fetch("https://api.heygen.com/v3/users/me", {
      headers,
      cache: "no-store",
    });
    const meJson = (await meRes.json().catch(() => null)) as {
      data?: {
        email?: string;
        first_name?: string;
        last_name?: string;
        username?: string;
        billing_type?: string;
        wallet?: { remaining_balance?: number; currency?: string };
      };
      error?: unknown;
    } | null;

    if (!meRes.ok || !meJson?.data) {
      return Response.json(
        {
          ok: false,
          error: "Connexion HeyGen refusée (clé invalide ou API down).",
          status: meRes.status,
          data: meJson,
        },
        { status: meRes.status || 500 },
      );
    }

    let planCredits: number | undefined;
    try {
      const quotaRes = await fetch(
        "https://api.heygen.com/v2/user/remaining_quota",
        { headers, cache: "no-store" },
      );
      const quotaJson = (await quotaRes.json().catch(() => null)) as {
        data?: { remaining_quota?: number; details?: { plan_credit?: number } };
      } | null;
      if (quotaRes.ok && quotaJson?.data) {
        planCredits =
          quotaJson.data.details?.plan_credit ??
          quotaJson.data.remaining_quota;
      }
    } catch {
      // optional legacy quota endpoint
    }

    const d = meJson.data;
    const name =
      [d.first_name, d.last_name].filter(Boolean).join(" ") ||
      d.email ||
      "Compte HeyGen";
    const walletBalance = d.wallet?.remaining_balance;
    const hasCredits =
      (typeof walletBalance === "number" && walletBalance > 0) ||
      (typeof planCredits === "number" && planCredits > 0);

    const summary: HeygenSummary = {
      ok: true,
      name,
      email: d.email,
      billingType: d.billing_type,
      walletBalance,
      planCredits,
      message: hasCredits
        ? `HeyGen OK · ${name}`
        : `HeyGen connecté · ${name} · solde wallet 0 (recharge ou plan requis pour générer)`,
    };

    return Response.json({ ok: true, summary, data: meJson });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Erreur HeyGen",
      },
      { status: 500 },
    );
  }
}
