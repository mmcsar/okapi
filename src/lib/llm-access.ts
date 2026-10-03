/**
 * Accès LLM selon abonnement — gratuit = Flash, payant = Pro autorisé.
 */

import { resolveEngine, type OkapiEngine } from "@/lib/okapi-engine";
import { getUserFromAuthHeader } from "@/lib/supabase";

export type LlmAccess = {
  paid: boolean;
};

/** Invité / free → false. Abonnement actif (période valide) → true. */
export async function resolveLlmAccess(request: Request): Promise<LlmAccess> {
  try {
    const session = await getUserFromAuthHeader(request);
    if (!session) return { paid: false };

    const { data: sub } = await session.supabase
      .from("subscriptions")
      .select("status, plan_id, current_period_end")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!sub || sub.status !== "active") return { paid: false };
    if (sub.plan_id === "free") return { paid: false };
    if (
      sub.current_period_end &&
      new Date(sub.current_period_end).getTime() <= Date.now()
    ) {
      return { paid: false };
    }
    return { paid: true };
  } catch {
    return { paid: false };
  }
}

/** Gratuit / invité : toujours Flash. Payant : respecte le body. */
export function resolveEngineForPlan(
  raw: string | null | undefined,
  paid: boolean,
): OkapiEngine {
  if (!paid) return "flash";
  return resolveEngine(raw);
}
