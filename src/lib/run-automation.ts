import { friendlyLlmError } from "@/lib/llm-errors";
import { missingLlmMessage, pickLlmProvider } from "@/lib/llm-provider";
import { openAiComplete } from "@/lib/openai";
import { openRouterComplete } from "@/lib/openrouter";
import {
  getTemplate,
  type AutomationRow,
  type ScheduleKey,
} from "@/lib/scheduled-tasks";

export async function runAutomationLlm(opts: {
  templateId: string;
  topic?: string | null;
  title?: string;
  /** Mémoire projets / métier de l’utilisateur */
  intelligenceContext?: string | null;
}) {
  const tpl = getTemplate(opts.templateId);
  if (!tpl) throw new Error("Modèle d’automatisation inconnu.");

  const provider = pickLlmProvider();
  if (!provider) throw new Error(missingLlmMessage());

  const system = [
    tpl.systemHint,
    opts.intelligenceContext?.trim() || null,
    "Tu es plus intelligent qu’un modèle générique: tu utilises la MÉMOIRE OKAPI si fournie.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    `Automatisation: ${opts.title || tpl.title}`,
    opts.topic?.trim() ? `Sujet / contexte: ${opts.topic.trim()}` : null,
    "Produis le résultat maintenant (français, concis, actionnable).",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (provider === "openai") {
      return await openAiComplete({
        system,
        user,
        maxTokens: 1400,
        engine: "flash",
      });
    }
    if (provider === "openrouter") {
      return await openRouterComplete({
        system,
        user,
        maxTokens: 1400,
        engine: "flash",
      });
    }
    throw new Error(missingLlmMessage());
  } catch (err) {
    throw new Error(friendlyLlmError(err));
  }
}

export function patchAfterRun(
  row: Pick<AutomationRow, "run_count">,
  result: string,
) {
  return {
    last_run_at: new Date().toISOString(),
    last_result: result.slice(0, 12_000),
    run_count: (row.run_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeScheduleKey(raw: unknown): ScheduleKey {
  const v = typeof raw === "string" ? raw : "";
  const allowed: ScheduleKey[] = [
    "weekdays_0800",
    "weekdays_0900",
    "monday_0900",
    "friday_1600",
    "daily_0900",
    "manual",
  ];
  return (allowed.includes(v as ScheduleKey) ? v : "manual") as ScheduleKey;
}
