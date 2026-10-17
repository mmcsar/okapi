/**
 * Accès LLM selon abonnement — gratuit = Flash, payant = Pro autorisé.
 */

import { resolveEngine, type OkapiEngine } from "@/lib/okapi-engine";
import { getUserFromAuthHeader } from "@/lib/supabase";

export type LlmAccess = {
  paid: boolean;
  /** Compte connecté. Sert de clé de quota stable entre serveurs. */
  userId: string | null;
};

/** Invité / free → false. Abonnement actif (période valide) → true. */
export async function resolveLlmAccess(request: Request): Promise<LlmAccess> {
  try {
    const session = await getUserFromAuthHeader(request);
    if (!session) return { paid: false, userId: null };
    const userId = session.user.id;

    const { data: sub } = await session.supabase
      .from("subscriptions")
      .select("status, plan_id, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (!sub || sub.status !== "active") return { paid: false, userId };
    if (sub.plan_id === "free") return { paid: false, userId };
    if (
      sub.current_period_end &&
      new Date(sub.current_period_end).getTime() <= Date.now()
    ) {
      return { paid: false, userId };
    }
    return { paid: true, userId };
  } catch {
    return { paid: false, userId: null };
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
