"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUsd } from "@/data/admin-clients";
import { kycStatusLabel } from "@/lib/kyc";

type OverviewCounts = {
  users: number;
  usersWeek: number;
  projects: number;
  projectsToday: number;
  projectsWeek: number;
  subscriptionsActive: number;
  kycPending: number;
  paymentsPending: number;
  paymentsPaid: number;
  clients: number;
  clientsByStage: {
    prospect: number;
    qualified: number;
    proposal: number;
    active: number;
  };
  pipelineUsd: number;
  revenueCdf: number;
  revenueWeekCdf: number;
  revenueLabel: string;
  revenueWeekLabel: string;
};

type RecentUser = {
  id: string;
  name: string;
  city: string;
  kycStatus: string;
  createdAt: string | null;
};

type RecentProject = {
  id: string;
  title: string;
  sector: string;
  updatedAt: string;
};

type OverviewPayload = {
  ok?: boolean;
  error?: string;
  setupRequired?: boolean;
  generatedAt?: string;
  counts?: OverviewCounts;
  planMix?: Record<string, number>;
  recentUsers?: RecentUser[];
  recentProjects?: RecentProject[];
};

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

function polar(cx: number, cy: number, radius: number, pct: number) {
  const p = Math.max(0, Math.min(100, pct));
  const a = Math.PI * (1 - p / 100);
  return {
    x: cx + radius * Math.cos(a),
    y: cy - radius * Math.sin(a),
  };
}

function Gauge({ pct }: { pct: number }) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    const start = shownRef.current;
    const end = Math.max(0, Math.min(100, pct));
    const t0 = performance.now();
    const dur = 650;
    let raf = 0;
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - u) ** 3;
      const next = start + (end - start) * e;
      shownRef.current = next;
      setShown(next);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  const cx = 80;
  const cy = 78;
  const trackR = 58;
  const needleR = 48;
  const tip = polar(cx, cy, needleR, shown);
  const a = Math.PI * (1 - shown / 100);
  const px = Math.sin(a) * 4.5;
  const py = Math.cos(a) * 4.5;
  const base1 = { x: cx - px, y: cy - py };
  const base2 = { x: cx + px, y: cy + py };
  const arcLen = Math.PI * trackR;
  const dash = (shown / 100) * arcLen;

  return (
    <svg
      viewBox="0 0 160 92"
      className="mx-auto block h-[84px] w-full max-w-[160px]"
    >
      <path
        d={`M ${cx - trackR} ${cy} A ${trackR} ${trackR} 0 0 0 ${cx + trackR} ${cy}`}
        fill="none"
        stroke="#e5ebe7"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - trackR} ${cy} A ${trackR} ${trackR} 0 0 0 ${cx + trackR} ${cy}`}
        fill="none"
        stroke="#1b4f3a"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${arcLen}`}
      />
      <polygon
        points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
        fill="#14261c"
      />
      <circle cx={tip.x} cy={tip.y} r="3" fill="#e8892a" />
      <circle cx={cx} cy={cy} r="9" fill="#1b4f3a" />
      <circle cx={cx} cy={cy} r="5" fill="#e8892a" />
      <circle cx={cx} cy={cy} r="2" fill="#fff" />
    </svg>
  );
}

function pctOf(value: number, of: number) {
  if (of <= 0) return value > 0 ? 100 : 0;
  return Math.min(100, Math.round((value / of) * 100));
}

export function AdminExecutiveDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [data, setData] = useState<OverviewPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      const json = (await res.json()) as OverviewPayload;
      if (!res.ok || !json.ok) {
        setSetupRequired(Boolean(json.setupRequired));
        setError(json.error ?? `Erreur ${res.status}`);
        setData(null);
        return;
      }
      setSetupRequired(false);
      setData(json);
    } catch {
      setError("Impossible de charger la synthèse admin.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const c = data?.counts;
  const planEntries = Object.entries(data?.planMix || {}).sort(
    (a, b) => b[1] - a[1],
  );

  const gauges = c
    ? [
        {
          title: "Comptes Okapi",
          value: `${fmtInt(c.users)} comptes`,
          hint:
            c.usersWeek > 0
              ? `+${fmtInt(c.usersWeek)} cette semaine`
              : "Créations cette semaine",
          pct: pctOf(c.users, Math.max(c.users, 50)),
        },
        {
          title: "Abonnements actifs",
          value: `${fmtInt(c.subscriptionsActive)} actifs`,
          hint: `${fmtInt(c.paymentsPending)} paiements en attente`,
          pct: pctOf(c.subscriptionsActive, Math.max(c.users, 1)),
        },
        {
          title: "Encaissements Mobile Money",
          value: c.revenueLabel,
          hint: `${c.revenueWeekLabel} cette semaine`,
          pct: pctOf(c.revenueWeekCdf, Math.max(c.revenueCdf, 1)),
        },
        {
          title: "Projets générés",
          value: `${fmtInt(c.projects)} projets`,
          hint: `${fmtInt(c.projectsToday)} aujourd’hui · ${fmtInt(c.projectsWeek)} / 7 j`,
          pct: pctOf(c.projectsWeek, Math.max(c.projects, 1)),
        },
        {
          title: "Pipeline CRM",
          value: formatUsd(c.pipelineUsd),
          hint: `${fmtInt(c.clients)} clients · ${fmtInt(c.clientsByStage.active)} actifs`,
          pct: pctOf(c.clientsByStage.active, Math.max(c.clients, 1)),
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-amber-deep">
            Direction · live
          </p>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
            Tableau de bord exécutif
          </h2>
          <p className="mt-1 text-sm text-okapi-ink/55">
            Chiffres réels Okapi — comptes, projets, Mobile Money, CRM MMC.
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
        <p className="text-sm text-okapi-ink/50">Chargement de la synthèse…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-okapi-amber/30 bg-okapi-amber/10 px-4 py-3 text-sm text-okapi-amber-deep">
          {error}
          {setupRequired ? (
            <span className="mt-1 block text-xs">
              Vérifie la clé service Supabase et les migrations SQL.
            </span>
          ) : null}
        </div>
      ) : null}

      {c ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {gauges.map((g) => (
              <article
                key={g.title}
                className="rounded-[24px] border border-[var(--okapi-stroke)] bg-white/80 p-4"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-okapi-ink/40">
                  {g.title}
                </p>
                <Gauge pct={g.pct} />
                <p className="mt-1 text-center font-[family-name:var(--font-syne)] text-lg font-bold leading-tight">
                  {g.value}
                </p>
                <p className="mt-1 text-center text-[11px] text-okapi-ink/45">
                  {g.hint}
                </p>
              </article>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "KYC en attente",
                value: fmtInt(c.kycPending),
                tone: c.kycPending > 0 ? "warn" : "ok",
              },
              {
                label: "Paiements à valider",
                value: fmtInt(c.paymentsPending),
                tone: c.paymentsPending > 0 ? "warn" : "ok",
              },
              {
                label: "Paiements confirmés",
                value: fmtInt(c.paymentsPaid),
                tone: "ok",
              },
              {
                label: "Clients CRM actifs",
                value: fmtInt(c.clientsByStage.active),
                tone: "ok",
              },
            ].map((card) => (
              <article
                key={card.label}
                className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-okapi-ink/40">
                  {card.label}
                </p>
                <p
                  className={`mt-2 font-[family-name:var(--font-syne)] text-3xl font-bold ${
                    card.tone === "warn"
                      ? "text-okapi-amber-deep"
                      : "text-okapi-forest"
                  }`}
                >
                  {card.value}
                </p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
              <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                Pipeline CRM par étape
              </h3>
              <ul className="mt-4 space-y-2">
                {(
                  [
                    ["prospect", "Prospect"],
                    ["qualified", "Qualifié"],
                    ["proposal", "Proposition"],
                    ["active", "Actif"],
                  ] as const
                ).map(([key, label]) => {
                  const n = c.clientsByStage[key];
                  const width = pctOf(n, Math.max(c.clients, 1));
                  return (
                    <li key={key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-okapi-ink/65">{label}</span>
                        <span className="font-semibold">{fmtInt(n)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-okapi-mist">
                        <div
                          className="h-full rounded-full bg-okapi-forest"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
              <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                Mix plans payés
              </h3>
              {planEntries.length === 0 ? (
                <p className="mt-4 text-sm text-okapi-ink/45">
                  Aucun paiement confirmé pour l’instant.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {planEntries.map(([label, n]) => (
                    <li
                      key={label}
                      className="flex items-center justify-between rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/50 px-4 py-3 text-sm"
                    >
                      <span className="font-medium">{label}</span>
                      <span className="rounded-full bg-okapi-forest/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-okapi-forest">
                        {fmtInt(n)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
              <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                Comptes récents
              </h3>
              <ul className="mt-4 space-y-2">
                {(data?.recentUsers || []).length === 0 ? (
                  <li className="text-sm text-okapi-ink/45">Aucun compte.</li>
                ) : (
                  (data?.recentUsers || []).map((user) => (
                    <li
                      key={user.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{user.name}</p>
                        <p className="text-xs text-okapi-ink/45">
                          {user.city} · {fmtWhen(user.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase text-okapi-ink/55">
                        {kycStatusLabel(user.kycStatus)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
              <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                Projets récents
              </h3>
              <ul className="mt-4 space-y-2">
                {(data?.recentProjects || []).length === 0 ? (
                  <li className="text-sm text-okapi-ink/45">Aucun projet.</li>
                ) : (
                  (data?.recentProjects || []).map((project) => (
                    <li
                      key={project.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{project.title}</p>
                        <p className="text-xs text-okapi-ink/45">
                          {project.sector} · {fmtWhen(project.updatedAt)}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
