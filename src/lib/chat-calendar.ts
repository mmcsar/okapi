/**
 * Calendrier Accueil — données exactes + marqueur UI (pas le LLM).
 */

export const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

export const DOW_FR = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"] as const;

/** Jours fériés fixes RDC (mois 1–12, jour). */
export const RDC_FIXED_HOLIDAYS: { m: number; d: number; label: string }[] = [
  { m: 1, d: 1, label: "Nouvel An" },
  { m: 1, d: 4, label: "Martyrs de l’indépendance" },
  { m: 1, d: 16, label: "Héros de la Nation" },
  { m: 1, d: 17, label: "Héros de la Nation" },
  { m: 5, d: 1, label: "Fête du Travail" },
  { m: 5, d: 17, label: "Libération" },
  { m: 6, d: 30, label: "Indépendance" },
  { m: 8, d: 1, label: "Parents" },
  { m: 10, d: 14, label: "Fondation de la République" },
  { m: 10, d: 17, label: "L.D. Kabila" },
  { m: 12, d: 25, label: "Noël" },
];

const OPEN = "<<<CALENDAR";
const CLOSE = "CALENDAR>>>";

export type CalendarPayload = {
  year: number;
  holidays: boolean;
};

function stripAccents(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

export function wantsCalendar(message: string): boolean {
  const n = stripAccents(message);
  return /\b(calendrier|calandrier|calendirer|calendar|almanach)\b/.test(n);
}

export function resolveCalendarYear(
  message: string,
  history?: { role: string; content: string }[],
  now = new Date(),
): number {
  const inMsg = message.match(/\b(20\d{2})\b/);
  if (inMsg) return Number(inMsg[1]);

  const n = stripAccents(message);
  if (/\b(annee )?prochaine\b/.test(n) || /\bl.?an prochain\b/.test(n)) {
    return now.getFullYear() + 1;
  }

  const hist = (history || []).slice(-8);
  for (let i = hist.length - 1; i >= 0; i--) {
    const y = hist[i]?.content.match(/\b(20\d{2})\b/);
    if (y && (hist[i]?.role === "user" || wantsCalendar(hist[i]?.content || ""))) {
      return Number(y[1]);
    }
  }
  for (let i = hist.length - 1; i >= 0; i--) {
    const hn = stripAccents(hist[i]?.content || "");
    if (/\b(annee )?prochaine\b/.test(hn) || /\bl.?an prochain\b/.test(hn)) {
      return now.getFullYear() + 1;
    }
  }

  return now.getFullYear();
}

/** Message courant ou suite après une demande calendrier. */
export function shouldServeCalendar(
  message: string,
  history?: { role: string; content: string }[],
): boolean {
  if (wantsCalendar(message)) return true;
  const n = stripAccents(message);
  const yearOnly = /^\s*20\d{2}\s*$/.test(message.trim());
  const prochaineOnly =
    /^\s*(l.?annee|annee|l.?an)\s+prochaine\s*$/.test(n) ||
    /^\s*annee\s+prochaine\s*$/.test(n);
  const feriesFollow =
    /^\s*(avec\s+)?(les\s+)?(jours?\s+)?feries?(\s+rdc)?\s*$/.test(n) ||
    /^\s*vierge\s*$/.test(n);
  if (!yearOnly && !prochaineOnly && !feriesFollow) return false;
  if (!history?.length) return yearOnly || prochaineOnly;
  const recent = history.slice(-10);
  return recent.some(
    (h) =>
      wantsCalendar(h.content) ||
      /\b(quelle annee|jours feries|calendrier|calandrier)\b/i.test(
        stripAccents(h.content),
      ),
  );
}

export function holidayLabel(
  year: number,
  month: number,
  day: number,
): string | null {
  const hit = RDC_FIXED_HOLIDAYS.find((h) => h.m === month && h.d === day);
  return hit ? hit.label : null;
}

/** Cellules lundi→dimanche pour un mois (null = vide). */
export function monthCells(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startMon = (first.getDay() + 6) % 7;
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startMon; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function extractCalendarFromAssistant(text: string): {
  calendar: CalendarPayload | null;
  textWithoutCalendar: string;
} {
  const start = text.indexOf(OPEN);
  const end = text.indexOf(CLOSE);
  if (start >= 0 && end > start) {
    const raw = text.slice(start + OPEN.length, end).trim();
    let calendar: CalendarPayload | null = null;
    try {
      const parsed = JSON.parse(raw) as Partial<CalendarPayload>;
      const year = Number(parsed.year);
      if (year >= 2000 && year <= 2100) {
        calendar = { year, holidays: Boolean(parsed.holidays) };
      }
    } catch {
      calendar = null;
    }
    const textWithoutCalendar = `${text.slice(0, start).trim()}\n\n${text
      .slice(end + CLOSE.length)
      .trim()}`.trim();
    return { calendar, textWithoutCalendar };
  }

  // Secours : faux calendrier SVG / texte LLM, ou refus méta (« connectez-vous sur Accueil »)
  const n = stripAccents(text);
  const looksLikeCalendarDump =
    (/\bcalendrier\s+20\d{2}\b/i.test(text) &&
      (text.includes("<<<SVG") ||
        /janvier\s+20\d{2}/i.test(text) ||
        /Lun[\s\S]{0,40}Mar[\s\S]{0,40}Mer/i.test(text))) ||
    /\b(calendrier integre|je ne peux pas generer|fichier calendrier|connectez[- ]vous|consulter le calendrier|affiche automatiquement les dates)\b/.test(
      n,
    );
  if (looksLikeCalendarDump) {
    const y =
      text.match(/\bcalendrier\s+(20\d{2})\b/i)?.[1] ||
      text.match(/\b(20\d{2})\b/)?.[1];
    const year = y ? Number(y) : new Date().getFullYear();
    return {
      calendar: { year, holidays: true },
      textWithoutCalendar: professionalCalendarCaption(year, true),
    };
  }

  return { calendar: null, textWithoutCalendar: text };
}

function professionalCalendarCaption(year: number, holidays: boolean) {
  if (holidays) {
    return `Calendrier ${year} — lundi en tête, jours fériés RDC (dates fixes) en ambre.`;
  }
  return `Calendrier ${year} — lundi en tête.`;
}

export function formatCalendarAnswer(
  message: string,
  history?: { role: string; content: string }[],
  now = new Date(),
): string {
  const year = resolveCalendarYear(message, history, now);
  const blob = stripAccents(
    [message, ...(history || []).map((h) => h.content)].join(" "),
  );
  const refuseHolidays = /\b(vierge|sans ferie|sans feries|blank)\b/.test(blob);
  const useHolidays = !refuseHolidays;
  const payload: CalendarPayload = { year, holidays: useHolidays };

  return [
    professionalCalendarCaption(year, useHolidays),
    "",
    OPEN,
    JSON.stringify(payload),
    CLOSE,
  ].join("\n");
}
