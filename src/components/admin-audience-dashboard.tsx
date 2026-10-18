"use client";

import { useCallback, useEffect, useState } from "react";

type Totals = {
  accounts: number;
  accountsWeek: number;
  active7d: number;
  projects: number;
  chats7d: number;
  generates7d: number;
  guests7d: number;
  visits7d: number;
  visitors7d: number;
  guestVisitors7d: number;
};

type DayRow = {
  day: string;
  signups: number;
  chats: number;
  generates: number;
  visits: number;
};

type Visit = {
  at: string;
  path: string;
  city: string;
  country: string;
  name: string;
  email?: string;
};

type Flag = { level: "abuse" | "watch"; label: string };

type ProjectItem = { title: string; at: string | null };

type UsageDay = { day: string; chats: number; generates: number };

type Alert = { level: "abuse" | "watch"; who: string; email: string; label: string };

type Guest = {
  id: string;
  label: string;
  email?: string;
  city: string;
  country: string;
  count: number;
  count7d: number;
  lastAt: string | null;
  passages: { at: string; path: string }[];
  chats14d: number;
  generates14d: number;
  usageDays: UsageDay[];
  flags: Flag[];
};

type Person = {
  id: string;
  email: string;
  name: string;
  city: string;
  phone: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  projects: number;
  lastProjectAt: string | null;
  lastProjectTitle: string | null;
  projectList?: ProjectItem[];
  chats7d: number;
  generates7d: number;
  country?: string;
  chats14d?: number;
  generates14d?: number;
  usageDays?: UsageDay[];
  flags?: Flag[];
};

type Payload = {
  ok?: boolean;
  error?: string;
  setupRequired?: boolean;
  usageReady?: boolean;
  visitsReady?: boolean;
  truncated?: boolean;
  totals?: Totals;
  days?: DayRow[];
  visits?: Visit[];
  people?: Person[];
  alerts?: Alert[];
  guests?: Guest[];
};

const PATH_LABEL: Record<string, string> = {
  home: "Accueil",
  studio: "Studio",
  projects: "Projets",
  automations: "Automatisations",
  settings: "Paramètres",
  billing: "Abonnement",
  login: "Connexion",
};

function countryName(code: string) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function placeLine(city: string, country: string) {
  const pays = countryName(country);
  return {
    ville: city || "Non connue",
    pays: pays || "Non connu",
  };
}

function pathLabel(path: string) {
  if (PATH_LABEL[path]) return PATH_LABEL[path];
  if (path.startsWith("p/")) return `Page publique · ${path.slice(2)}`;
  return path;
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDay(day: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
    }).format(new Date(`${day}T12:00:00Z`));
  } catch {
    return day;
  }
}

export function AdminAudienceDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [usageReady, setUsageReady] = useState(true);
  const [visitsReady, setVisitsReady] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSetupRequired(false);
    try {
      const res = await fetch("/api/admin/analytics");
      const json = (await res.json()) as Payload;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
        setSetupRequired(Boolean(json.setupRequired));
        setTotals(null);
        setDays([]);
        setVisits([]);
        setPeople([]);
        setAlerts([]);
        setGuests([]);
        return;
      }
      setTotals(json.totals ?? null);
      setDays(json.days ?? []);
      setVisits(json.visits ?? []);
      setPeople(json.people ?? []);
      setAlerts(json.alerts ?? []);
      setGuests(json.guests ?? []);
      setUsageReady(json.usageReady !== false);
      setVisitsReady(json.visitsReady !== false);
      setTruncated(Boolean(json.truncated));
    } catch {
      setError("Audience indisponible.");
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxBar = Math.max(
    1,
    ...days.map((d) =>
      visitsReady ? d.visits : d.signups + d.chats + d.generates,
    ),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-amber-deep">
            Audience · live
          </p>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
            Qui passe sur Okapi
          </h2>
          <p className="mt-1 text-sm text-okapi-ink/55">
            Comptes et visiteurs sans compte : pages, horaires, messages, et
            signalement si quelqu’un sature Okapi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/80 px-4 py-2 text-sm font-semibold text-okapi-ink/70 hover:bg-white"
        >
          Rafraîchir
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-okapi-ink/50">Chargement de l’audience…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-okapi-amber/30 bg-okapi-amber/10 px-4 py-3 text-sm text-okapi-amber-deep">
          {error}
          {setupRequired ? (
            <span className="mt-1 block text-xs">
              Ouvre https://okapii.tech/admin. La clé sb_secret_ est déjà sur Vercel.
            </span>
          ) : null}
        </div>
      ) : null}

      {totals ? (
        <>
          <section
            className={`rounded-[28px] border p-5 ${
              alerts.some((alert) => alert.level === "abuse")
                ? "border-red-200 bg-red-50"
                : alerts.length
                  ? "border-okapi-amber/40 bg-okapi-amber/10"
                  : "border-[var(--okapi-stroke)] bg-white/80"
            }`}
          >
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Recherche abusive
            </h3>
            <p className="mt-1 text-xs text-okapi-ink/50">
              Signalé à partir de 20 messages ou 6 générations dans une journée,
              de 25 passages en 7 jours, ou de 6 pages différentes en moins
              d’une heure.
            </p>
            {alerts.length === 0 ? (
              <p className="mt-3 text-sm text-okapi-ink/70">
                Aucun signalement sur 14 jours.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {alerts.map((alert, index) => (
                  <li
                    key={`${alert.who}-${alert.label}-${index}`}
                    className="rounded-2xl bg-white/80 px-3 py-2 text-sm"
                  >
                    <p className="font-semibold text-okapi-ink">
                      {alert.level === "abuse" ? "Abus" : "À surveiller"} · {alert.who}
                    </p>
                    <p className="text-xs text-okapi-ink/55">
                      {alert.email ? `${alert.email} · ` : ""}
                      {alert.label}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Passages · 7 j",
                value: fmtInt(totals.visits7d || 0),
                hint: visitsReady
                  ? "Accueil, Studio, pages publiques"
                  : "Lance 20261018_okapi_visits.sql",
              },
              {
                label: "Visiteurs · 7 j",
                value: fmtInt(totals.visitors7d || 0),
                hint: `${fmtInt(totals.guestVisitors7d || 0)} sans compte`,
              },
              {
                label: "Comptes",
                value: fmtInt(totals.accounts),
                hint:
                  totals.accountsWeek > 0
                    ? `+${fmtInt(totals.accountsWeek)} cette semaine`
                    : "Inscrits Okapi",
              },
              {
                label: "Actifs · 7 j",
                value: fmtInt(totals.active7d),
                hint: `${fmtInt(totals.chats7d)} msg · ${fmtInt(totals.generates7d)} gén.`,
              },
            ].map((card) => (
              <article
                key={card.label}
                className="rounded-[24px] border border-[var(--okapi-stroke)] bg-white/80 p-4"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-okapi-ink/40">
                  {card.label}
                </p>
                <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold">
                  {card.value}
                </p>
                <p className="mt-1 text-[11px] text-okapi-ink/45">{card.hint}</p>
              </article>
            ))}
          </section>

          <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              14 derniers jours
            </h3>
            <p className="mt-1 text-xs text-okapi-ink/45">
              {visitsReady
                ? "Passages sur la plateforme."
                : "Lance 20261018_okapi_visits.sql pour les passages."}
              {usageReady
                ? ""
                : " Lance 20261017_usage_daily.sql pour le détail chat / génération."}
            </p>
            <div className="mt-4 flex items-end gap-1 overflow-x-auto">
              {days.map((row) => {
                const total = visitsReady
                  ? row.visits
                  : row.signups + row.chats + row.generates;
                const h = Math.max(4, Math.round((total / maxBar) * 72));
                return (
                  <div
                    key={row.day}
                    className="flex min-w-8 flex-1 flex-col items-center gap-1"
                    title={`${fmtDay(row.day)} · ${row.signups} inscrits · ${row.chats} messages · ${row.generates} générations`}
                  >
                    <span className="text-[10px] text-okapi-ink/40">
                      {total || ""}
                    </span>
                    <div
                      className="w-full max-w-6 rounded-t-md bg-okapi-forest"
                      style={{ height: h }}
                    />
                    <span className="text-[10px] text-okapi-ink/40">
                      {fmtDay(row.day)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.12em] text-okapi-ink/40">
                    <th className="pb-2 pr-3 font-medium">Jour</th>
                    <th className="pb-2 pr-3 font-medium">Passages</th>
                    <th className="pb-2 pr-3 font-medium">Inscrits</th>
                    <th className="pb-2 pr-3 font-medium">Messages</th>
                    <th className="pb-2 font-medium">Générations</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((row) => (
                    <tr key={row.day} className="border-t border-[var(--okapi-stroke)]">
                      <td className="py-2 pr-3">{fmtDay(row.day)}</td>
                      <td className="py-2 pr-3">{fmtInt(row.visits)}</td>
                      <td className="py-2 pr-3">{fmtInt(row.signups)}</td>
                      <td className="py-2 pr-3">{fmtInt(row.chats)}</td>
                      <td className="py-2">{fmtInt(row.generates)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Passages récents
            </h3>
            <p className="mt-1 text-xs text-okapi-ink/45">
              Le nom apparaît seulement si la personne est connectée.
            </p>
            {visits.length === 0 ? (
              <p className="mt-3 text-sm text-okapi-ink/50">
                Aucun passage enregistré.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--okapi-stroke)]">
                {visits.map((visit, index) => (
                  <li
                    key={`${visit.at}-${visit.path}-${index}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-okapi-ink">
                        {visit.name || "Visiteur"}
                      </p>
                      <p className="text-xs text-okapi-ink/55">
                        {pathLabel(visit.path)}
                      </p>
                      <p className="text-xs text-okapi-ink/50">
                        E-mail · {visit.email || "Pas d’e-mail"}
                      </p>
                      <p className="text-xs text-okapi-ink/50">
                        Ville · {placeLine(visit.city, visit.country).ville}
                        {" · "}
                        Pays · {placeLine(visit.city, visit.country).pays}
                      </p>
                    </div>
                    <p className="text-xs text-okapi-ink/45">{fmtWhen(visit.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Sans compte ({fmtInt(guests.length)})
            </h3>
            <p className="mt-1 text-xs text-okapi-ink/45">
              Personnes qui ouvrent Okapi ou lancent une recherche sans être
              connectées. Pas d’adresse e-mail.
            </p>
            {guests.length === 0 ? (
              <p className="mt-3 text-sm text-okapi-ink/50">
                Aucun visiteur sans compte sur 14 jours.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {guests.map((guest, index) => {
                  const flagged = guest.flags.some((flag) => flag.level === "abuse");
                  return (
                    <li
                      key={guest.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        flagged
                          ? "border-red-200 bg-red-50/70"
                          : guest.flags.length
                            ? "border-okapi-amber/40 bg-okapi-amber/5"
                            : "border-[var(--okapi-stroke)] bg-white/70"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-okapi-ink">
                            Sans compte · {index + 1}
                          </p>
                          <p className="text-xs text-okapi-ink/50">
                            E-mail · {guest.email || "Pas d’e-mail"}
                          </p>
                          <p className="text-xs text-okapi-ink/50">
                            Ville · {placeLine(guest.city, guest.country).ville}
                          </p>
                          <p className="text-xs text-okapi-ink/50">
                            Pays · {placeLine(guest.city, guest.country).pays}
                          </p>
                        </div>
                        <p className="text-xs text-okapi-ink/45">
                          {guest.count7d
                            ? `${fmtInt(guest.count7d)} passages / 7 j`
                            : "Recherche sans inscription"}
                        </p>
                      </div>
                      {guest.flags.map((flag) => (
                        <p
                          key={flag.label}
                          className={`mt-2 text-xs font-semibold ${
                            flag.level === "abuse"
                              ? "text-red-800"
                              : "text-okapi-amber-deep"
                          }`}
                        >
                          {flag.level === "abuse" ? "Abus" : "À surveiller"} · {flag.label}
                        </p>
                      ))}
                      <p className="mt-2 text-xs text-okapi-ink/55">
                        Dernier passage {fmtWhen(guest.lastAt)} · {fmtInt(guest.chats14d)} msg
                        / 14 j · {fmtInt(guest.generates14d)} gén. / 14 j
                      </p>
                      {guest.passages.length > 0 ? (
                        <ul className="mt-2 space-y-0.5">
                          {guest.passages.map((passage, passageIndex) => (
                            <li
                              key={`${passage.at}-${passage.path}-${passageIndex}`}
                              className="text-sm text-okapi-ink/80"
                            >
                              {pathLabel(passage.path)}
                              <span className="text-xs text-okapi-ink/40">
                                {" "}
                                · {fmtWhen(passage.at)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {guest.usageDays.length > 0 ? (
                        <ul className="mt-2 space-y-0.5">
                          {guest.usageDays.map((day) => (
                            <li key={day.day} className="text-xs text-okapi-ink/55">
                              {fmtDay(day.day)} · {fmtInt(day.chats)} msg ·{" "}
                              {fmtInt(day.generates)} gén.
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                Comptes ({fmtInt(people.length)})
              </h3>
              {truncated ? (
                <p className="text-xs text-okapi-ink/45">
                  200 premiers comptes affichés.
                </p>
              ) : null}
            </div>
            {people.length === 0 ? (
              <p className="text-sm text-okapi-ink/50">Aucun compte pour l’instant.</p>
            ) : (
              <ul className="space-y-3">
                {people.map((person) => {
                  const flagged = (person.flags || []).some(
                    (flag) => flag.level === "abuse",
                  );
                  const watched = (person.flags || []).length > 0;
                  return (
                    <li
                      key={person.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        flagged
                          ? "border-red-200 bg-red-50/70"
                          : watched
                            ? "border-okapi-amber/40 bg-okapi-amber/5"
                            : "border-[var(--okapi-stroke)] bg-white/70"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-okapi-ink">{person.name}</p>
                          <p className="text-xs text-okapi-ink/50">
                            E-mail · {person.email && person.email !== "—" ? person.email : "Pas d’e-mail"}
                          </p>
                          <p className="text-xs text-okapi-ink/50">
                            Ville · {placeLine(person.city, person.country || "").ville}
                          </p>
                          <p className="text-xs text-okapi-ink/50">
                            Pays · {placeLine(person.city, person.country || "").pays}
                          </p>
                          <p className="text-xs text-okapi-ink/40">
                            {person.phone || "Pas de téléphone"}
                          </p>
                        </div>
                        <p className="text-xs text-okapi-ink/45">
                          Dernière visite{" "}
                          {fmtWhen(person.lastSignInAt || person.lastProjectAt)}
                        </p>
                      </div>
                      {(person.flags || []).length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {(person.flags || []).map((flag) => (
                            <li
                              key={flag.label}
                              className={`text-xs font-semibold ${
                                flag.level === "abuse"
                                  ? "text-red-800"
                                  : "text-okapi-amber-deep"
                              }`}
                            >
                              {flag.level === "abuse" ? "Abus" : "À surveiller"} · {flag.label}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="mt-2 text-xs text-okapi-ink/55">
                        Inscrit {fmtWhen(person.createdAt)} · {fmtInt(person.chats7d)} msg
                        / 7 j · {fmtInt(person.generates7d)} gén. / 7 j ·{" "}
                        {fmtInt(person.chats14d || 0)} msg / 14 j ·{" "}
                        {fmtInt(person.generates14d || 0)} gén. / 14 j
                      </p>
                      <div className="mt-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-okapi-ink/40">
                          Projets ({fmtInt(person.projects)})
                        </p>
                        {(person.projectList || []).length === 0 ? (
                          <p className="text-xs text-okapi-ink/45">Aucun projet.</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5">
                            {(person.projectList || []).map((project, index) => (
                              <li
                                key={`${project.title}-${project.at}-${index}`}
                                className="text-sm text-okapi-ink/80"
                              >
                                {project.title}
                                <span className="text-xs text-okapi-ink/40">
                                  {" "}
                                  · {fmtWhen(project.at)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {(person.usageDays || []).length > 0 ? (
                        <ul className="mt-2 space-y-0.5">
                          {(person.usageDays || []).map((day) => (
                            <li key={day.day} className="text-xs text-okapi-ink/55">
                              {fmtDay(day.day)} · {fmtInt(day.chats)} msg ·{" "}
                              {fmtInt(day.generates)} gén.
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-okapi-ink/40">
                          Aucun message ni génération sur 14 jours.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
