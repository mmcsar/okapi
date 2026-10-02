import { friendlyLlmError } from "@/lib/llm-errors";
import { claudeComplete } from "@/lib/anthropic";
import { missingLlmMessage, pickWithClaude } from "@/lib/llm-provider";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import { openAiComplete } from "@/lib/openai";
import { openRouterComplete } from "@/lib/openrouter";
import { resolveEngine } from "@/lib/okapi-engine";
import { assertBodySize } from "@/lib/security";
import {
  formatStudioHistory,
  sanitizeStudioHistory,
} from "@/lib/studio-context";
import {
  agentSystemBlock,
  resolveOkapiAgent,
} from "@/lib/studio-agents";
import {
  intelligenceSystemBlock,
  loadUserIntelligenceContext,
} from "@/lib/okapi-intelligence";
import { getUserFromAuthHeader } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 45;

type Body = {
  instruction?: string;
  engine?: string;
  agentId?: string;
  sector?: string;
  history?: unknown;
};

async function complete(opts: {
  system: string;
  user: string;
  engine: ReturnType<typeof resolveEngine>;
}) {
  const provider = pickWithClaude();
  if (!provider) throw new Error(missingLlmMessage());

  if (provider === "claude") {
    return claudeComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 900,
    });
  }
  if (provider === "openai") {
    return openAiComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 900,
      engine: opts.engine,
    });
  }
  if (provider === "openrouter") {
    return openRouterComplete({
      system: opts.system,
      user: opts.user,
      maxTokens: 900,
      engine: opts.engine,
    });
  }
  throw new Error(missingLlmMessage());
}

function buildSystem(agentBlock: string) {
  return `Tu es Okapi Studio (MMC SARL) — chef de produit technique pour la RDC.
Mission: COMPRENDRE l’idée avant de coder. Tu ne génères PAS de fichiers ici.

${agentBlock}

Règles:
1. Reformule en 2–4 phrases ce que tu as compris (métier, utilisateurs, valeur).
2. Pose 3 à 5 questions précises et utiles (pas de questionnaire générique). Priorise:
   - public / rôles (client, admin, réception…)
   - modules / écrans indispensables
   - paiements (Mobile Money, CDF, USSD) si vente — pas WhatsApp sauf demande
   - données à suivre (stock, RDV, clients…)
   - contrainte forte (mobile, hors-ligne léger, multi-villes…)
3. Annonce clairement qu’ensuite tu livreras une plateforme robuste (Preview HTML + React/Next + SQL + API, états vide/chargement/erreur, parcours métier complet).
4. Termine par: invite l’utilisateur à préciser OU à écrire « crée » / « vas-y » quand c’est clair.
5. Français clair, ton professionnel, concis. Pas de jargon vendeur. Jamais de noms de fournisseurs IA / cloud tiers — dis Okapi / MMC SARL.
6. Ne promets pas Java/C#/Go/PHP comme projet Studio — stack Okapi uniquement si tu cites la stack.
7. Réponse en texte brut uniquement (pas de JSON, pas de markdown de code).`;
}

export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 200_000);
  if (tooBig) return tooBig;

  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "chat");
  if (!quota.ok) return quotaExceededResponse(quota);

  const body = (await request.json().catch(() => null)) as Body | null;
  const instruction = body?.instruction?.trim() || "";
  if (!instruction) {
    return Response.json({ error: "Brief vide." }, { status: 400 });
  }

  const engine = resolveEngine(body?.engine);
  const agent = resolveOkapiAgent({
    agentId: body?.agentId,
    sector: body?.sector,
    instruction,
  });
  const history = sanitizeStudioHistory(body?.history);

  let agentBlock = agentSystemBlock(agent);
  try {
    const session = await getUserFromAuthHeader(request);
    if (session) {
      const memory = await loadUserIntelligenceContext(
        session.supabase,
        session.user.id,
      );
      agentBlock += intelligenceSystemBlock(memory);
    }
  } catch {
    // invité OK
  }

  try {
    const reply = await complete({
      system: buildSystem(agentBlock),
      engine,
      user: `Idée / brief de l’utilisateur:
-----
${instruction}
-----

Historique Agent (récent):
${formatStudioHistory(history)}

Comprends l’idée et pose les questions manquantes avant toute génération de code.`,
    });

    const text = reply.trim();
    if (!text) {
      return Response.json(
        { error: "Réponse vide — réessaie." },
        { status: 502 },
      );
    }

    return Response.json({
      ok: true,
      phase: "clarify",
      reply: text,
      agentId: agent.id,
      agentLabel: agent.label,
    });
  } catch (err) {
    return Response.json(
      { error: friendlyLlmError(err) },
      { status: 502 },
    );
  }
}
