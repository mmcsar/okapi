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
  chats7d: number;
  generates7d: number;
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
        return;
      }
      setTotals(json.totals ?? null);
      setDays(json.days ?? []);
      setVisits(json.visits ?? []);
      setPeople(json.people ?? []);
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
            Comptes, dernière connexion, projets et usage chat / génération
            sur 7 jours.
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
              Vérifie SUPABASE_SECRET_KEY (sb_secret_…) et les migrations SQL.
            </span>
          ) : null}
        </div>
      ) : null}

      {totals ? (
        <>
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
                      <p className="text-xs text-okapi-ink/45">
                        {pathLabel(visit.path)}
                        {visit.city
                          ? ` · ${visit.city}${visit.country ? `, ${visit.country}` : ""}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-xs text-okapi-ink/45">{fmtWhen(visit.at)}</p>
                  </li>
                ))}
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.12em] text-okapi-ink/40">
                      <th className="pb-2 pr-3 font-medium">Personne</th>
                      <th className="pb-2 pr-3 font-medium">Ville</th>
                      <th className="pb-2 pr-3 font-medium">Dernière visite</th>
                      <th className="pb-2 pr-3 font-medium">Projets</th>
                      <th className="pb-2 font-medium">7 j</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => (
                      <tr
                        key={person.id}
                        className="border-t border-[var(--okapi-stroke)]"
                      >
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-okapi-ink">
                            {person.name}
                          </p>
                          <p className="text-xs text-okapi-ink/45">
                            {person.email}
                            {person.phone ? ` · ${person.phone}` : ""}
                          </p>
                        </td>
                        <td className="py-3 pr-3 text-okapi-ink/70">
                          {person.city}
                        </td>
                        <td className="py-3 pr-3 text-okapi-ink/70">
                          {fmtWhen(person.lastSignInAt || person.lastProjectAt)}
                          <p className="text-[11px] text-okapi-ink/40">
                            Inscrit {fmtWhen(person.createdAt)}
                          </p>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-semibold">{person.projects}</p>
                          <p className="text-[11px] text-okapi-ink/40">
                            {person.lastProjectTitle || "—"}
                          </p>
                        </td>
                        <td className="py-3 text-okapi-ink/70">
                          {person.chats7d} msg · {person.generates7d} gén.
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
