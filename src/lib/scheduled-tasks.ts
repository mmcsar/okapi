/** Automatisations planifiées Okapi (RDC) — templates + planning. */

export type ScheduleKey =
  | "weekdays_0800"
  | "weekdays_0900"
  | "monday_0900"
  | "friday_1600"
  | "daily_0900"
  | "manual";

export type AutomationTemplateId =
  | "daily_briefing"
  | "inbox_triage"
  | "meeting_prep"
  | "weekly_review"
  | "content_ideas"
  | "monitor_topic";

export type AutomationTemplate = {
  id: AutomationTemplateId;
  title: string;
  description: string;
  defaultSchedule: ScheduleKey;
  scheduleLabel: string;
  /** Prompt système métier pour le run LLM */
  systemHint: string;
  /** Placeholder si l’utilisateur n’a pas encore de résultat */
  emptyHint: string;
  /** Champ libre optionnel (ex: sujet veille) */
  needsTopic?: boolean;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "daily_briefing",
    title: "Briefing du jour",
    description:
      "Ce qui mérite ton attention aujourd’hui : projets Okapi, clients, et prochaines actions.",
    defaultSchedule: "weekdays_0800",
    scheduleLabel: "Jours ouvrés à 8h00",
    systemHint:
      "Tu es Okapi (MMC SARL). Rédige un briefing du matin court en français pour un entrepreneur en RDC. Structure: 1) Priorités du jour 2) Risques 3) 3 actions concrètes. Ton clair, utile, sans jargon.",
    emptyHint: "Brief d’aujourd’hui",
  },
  {
    id: "inbox_triage",
    title: "Triage messages",
    description:
      "Classe les demandes urgentes (WhatsApp, email, clients) et propose des réponses courtes.",
    defaultSchedule: "weekdays_0800",
    scheduleLabel: "Jours ouvrés à 8h00",
    systemHint:
      "Tu es Okapi. Aide à trier une boîte de messages pro en RDC (WhatsApp / email). Catégories: Urgent, À traiter, Plus tard. Pour chaque urgent: brouillon de réponse courte en français. Si aucun contexte fourni, donne un modèle de routine matinale.",
    emptyHint: "Priorité haute",
  },
  {
    id: "meeting_prep",
    title: "Prep réunion",
    description:
      "Un mini-brief avant une réunion : objectifs, questions, et points à décider.",
    defaultSchedule: "weekdays_0900",
    scheduleLabel: "Jours ouvrés à 9h00",
    systemHint:
      "Tu es Okapi. Prépare une fiche réunion courte (FR) pour un builder / PME en RDC: objectif, ordre du jour, questions à poser, décision attendue. Si pas de contexte, utilise un exemple « revue produit ».",
    emptyHint: "Revue produit dans 45 min",
  },
  {
    id: "weekly_review",
    title: "Revue hebdo",
    description:
      "Résumé du vendredi : ce qui a avancé, ce qui reste ouvert, focus semaine prochaine.",
    defaultSchedule: "friday_1600",
    scheduleLabel: "Chaque vendredi à 16h00",
    systemHint:
      "Tu es Okapi. Fais une revue de semaine en français: 5 faits marquants, 2 ouverts, 3 priorités pour la semaine suivante. Contexte digitalisation / projets Okapi en RDC.",
    emptyHint: "5 terminés · 2 ouverts",
  },
  {
    id: "content_ideas",
    title: "Idées contenu",
    description:
      "Quelques idées de posts (WhatsApp Status, Facebook, LinkedIn) pour ton activité.",
    defaultSchedule: "monday_0900",
    scheduleLabel: "Chaque lundi à 9h00",
    systemHint:
      "Tu es Okapi. Propose 3 idées de posts courts pour un business en RDC (français simple, WhatsApp/Facebook). Format numéroté 1. 2. 3. avec accroche + angle.",
    emptyHint: "3 idées de posts",
  },
  {
    id: "monitor_topic",
    title: "Veille sujet",
    description:
      "Surveille un sujet, concurrent ou mot-clé utile à ton business.",
    defaultSchedule: "daily_0900",
    scheduleLabel: "Tous les jours à 9h00",
    systemHint:
      "Tu es Okapi. Fais une veille courte en français sur le sujet fourni (ou « digitalisation PME RDC » par défaut): 3 signaux, 1 opportunité, 1 risque. Pas d’invention de faits inventés comme s’ils étaient vérifiés — marque clairement les hypothèses.",
    emptyHint: "Points à surveiller",
    needsTopic: true,
  },
];

export const SCHEDULE_LABELS: Record<ScheduleKey, string> = {
  weekdays_0800: "Jours ouvrés à 8h00",
  weekdays_0900: "Jours ouvrés à 9h00",
  monday_0900: "Chaque lundi à 9h00",
  friday_1600: "Chaque vendredi à 16h00",
  daily_0900: "Tous les jours à 9h00",
  manual: "À la demande",
};

export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id);
}

/** Heure actuelle en Africa/Kinshasa (UTC+1). */
export function kinshasaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kinshasa",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  };
  return {
    weekday: weekdayMap[parts.weekday ?? "Mon"] ?? 1,
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0"),
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function matchesSchedule(key: ScheduleKey, now: ReturnType<typeof kinshasaParts>) {
  if (key === "manual") return false;
  const weekdays = now.weekday >= 1 && now.weekday <= 5;
  if (key === "weekdays_0800") return weekdays && now.hour === 8;
  if (key === "weekdays_0900") return weekdays && now.hour === 9;
  if (key === "monday_0900") return now.weekday === 1 && now.hour === 9;
  if (key === "friday_1600") return now.weekday === 5 && now.hour === 16;
  if (key === "daily_0900") return now.hour === 9;
  return false;
}

/** True si la tâche doit tourner cette heure-ci (et pas déjà ce jour-là). */
export function isAutomationDue(opts: {
  scheduleKey: ScheduleKey;
  enabled: boolean;
  lastRunAt: string | null;
  now?: Date;
}) {
  if (!opts.enabled) return false;
  if (opts.scheduleKey === "manual") return false;
  const now = kinshasaParts(opts.now);
  if (!matchesSchedule(opts.scheduleKey, now)) return false;
  if (!opts.lastRunAt) return true;
  const last = kinshasaParts(new Date(opts.lastRunAt));
  return last.dayKey !== now.dayKey;
}

export type AutomationRow = {
  id: string;
  user_id: string;
  template_id: string;
  title: string;
  schedule_key: ScheduleKey;
  enabled: boolean;
  topic: string | null;
  last_run_at: string | null;
  last_result: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
};
