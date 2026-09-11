"use client";

import { useMemo, useState } from "react";
import {
  CLIENT_STAGES,
  formatFrDate,
  formatUsd,
  SEED_CLIENTS,
  TEAM_LOAD,
  type AdminClient,
  type ClientStage,
} from "@/data/admin-clients";

const STAGE_LABEL: Record<ClientStage, string> = {
  prospect: "Prospect",
  qualified: "Qualifié",
  proposal: "Proposition",
  active: "Actif",
};

export function AdminClientsDashboard() {
  const [clients, setClients] = useState<AdminClient[]>(SEED_CLIENTS);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    company: "",
    city: "Kinshasa",
    owner: "Christian",
    valueUsd: "2000",
    nextAction: "Premier contact",
    deadline: "",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q),
    );
  }, [clients, query]);

  const pipelineValue = clients.reduce((s, c) => s + c.valueUsd, 0);
  const activeValue = clients
    .filter((c) => c.stage === "active")
    .reduce((s, c) => s + c.valueUsd, 0);
  const remaining = Math.max(pipelineValue - activeValue, 0);
  const target = Math.round(pipelineValue * 0.75);
  const overTargetPct =
    target > 0
      ? Math.max(0, ((activeValue - target) / target) * 100)
      : 0;

  const stageCounts = CLIENT_STAGES.map((s) => ({
    ...s,
    count: clients.filter((c) => c.stage === s.id).length,
  }));
  const proposalPct = Math.round(
    (clients.filter((c) => c.stage === "proposal").length /
      Math.max(clients.length, 1)) *
      100,
  );

  const overdue = [...filtered]
    .filter((c) => c.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays);

  const upcoming = [...filtered]
    .filter((c) => c.overdueDays === 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 6);

  const maxBar = Math.max(...TEAM_LOAD.map((t) => t.pct), 1);
  const budgetBars = [
    { label: "Pipeline total", value: pipelineValue, h: 100 },
    {
      label: "CA clients actifs",
      value: activeValue,
      h: Math.round((activeValue / Math.max(pipelineValue, 1)) * 100),
    },
    {
      label: "Objectif période",
      value: target,
      h: Math.round((target / Math.max(pipelineValue, 1)) * 100),
    },
  ];

  function addClient() {
    if (!form.name.trim() || !form.company.trim()) return;
    const id = `c${Date.now()}`;
    const deadline =
      form.deadline ||
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const next: AdminClient = {
      id,
      name: form.name.trim(),
      company: form.company.trim(),
      city: form.city.trim() || "Kinshasa",
      stage: "prospect",
      owner: form.owner.trim() || "Christian",
      valueUsd: Number(form.valueUsd) || 0,
      nextAction: form.nextAction.trim() || "Premier contact",
      deadline,
      workloadPct: 20,
      overdueDays: 0,
    };
    setClients((prev) => [next, ...prev]);
    setShowForm(false);
    setForm({
      name: "",
      company: "",
      city: "Kinshasa",
      owner: "Christian",
      valueUsd: "2000",
      nextAction: "Premier contact",
      deadline: "",
    });
  }

  function bumpStage(id: string) {
    const order: ClientStage[] = [
      "prospect",
      "qualified",
      "proposal",
      "active",
    ];
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const i = order.indexOf(c.stage);
        const next = order[Math.min(i + 1, order.length - 1)];
        return { ...c, stage: next, overdueDays: 0 };
      }),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-okapi-ink lg:text-3xl">
            Tableau de bord clients
          </h2>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Pipeline, relances et charge équipe — espace admin Okapi
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un client…"
            className="w-52 rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-3 py-2 text-sm outline-none focus:border-okapi-leaf/40"
          />
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-2xl bg-okapi-amber px-4 py-2 text-sm font-semibold text-white hover:bg-okapi-amber-deep"
          >
            {showForm ? "Fermer" : "+ Client"}
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/80 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["name", "Nom contact"],
                ["company", "Entreprise"],
                ["city", "Ville"],
                ["owner", "Responsable"],
                ["valueUsd", "Valeur ($)"],
                ["nextAction", "Prochaine action"],
                ["deadline", "Échéance"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-left">
                <span className="mb-1 block text-xs text-okapi-ink/45">
                  {label}
                </span>
                <input
                  type={key === "deadline" ? "date" : "text"}
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[var(--okapi-stroke)] bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={addClient}
            className="mt-3 rounded-2xl bg-okapi-forest px-4 py-2 text-sm font-semibold text-white"
          >
            Enregistrer le client
          </button>
        </div>
      ) : null}

      {/* Pipeline + objectif */}
      <section className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stageCounts.map((s) => (
              <div key={s.id} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center">
                  {s.status === "done" ? (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-okapi-forest text-lg text-white">
                      ✓
                    </span>
                  ) : s.status === "progress" ? (
                    <span
                      className="relative flex h-14 w-14 items-center justify-center rounded-full"
                      style={{
                        background: `conic-gradient(#e8892a ${proposalPct}%, #e5ebe7 0)`,
                      }}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-bold text-okapi-ink">
                        {proposalPct}%
                      </span>
                    </span>
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-okapi-ink/15 text-okapi-ink/40">
                      ⏱
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold">{s.label}</p>
                <p className="text-xs text-okapi-ink/45">
                  {s.count} ·{" "}
                  {s.status === "done"
                    ? "OK"
                    : s.status === "progress"
                      ? "En cours"
                      : "En attente"}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-okapi-mist">
            <div
              className="h-full rounded-full bg-gradient-to-r from-okapi-forest to-okapi-amber"
              style={{
                width: `${Math.round(
                  ((stageCounts[0].count + stageCounts[1].count) /
                    Math.max(clients.length, 1)) *
                    100,
                )}%`,
              }}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl bg-okapi-forest p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
            Objectif trimestre
          </p>
          <div>
            <p className="font-[family-name:var(--font-syne)] text-4xl font-bold">
              107 j
            </p>
            <p className="mt-1 text-sm text-white/80">jusqu’au 13 déc. 2026</p>
            <p className="mt-3 text-xs text-okapi-amber">
              Cible : {formatUsd(target)} CA actifs
            </p>
          </div>
        </div>
      </section>

      {/* Budget + overdue */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Pipeline commercial
          </h3>
          <div className="mt-4 flex items-end gap-6">
            <div className="flex h-36 items-end gap-3">
              {budgetBars.map((b) => (
                <div key={b.label} className="flex w-12 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-md bg-okapi-leaf/80"
                    style={{ height: `${Math.max(b.h, 8)}%` }}
                    title={`${b.label}: ${formatUsd(b.value)}`}
                  />
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p>
                <span className="text-okapi-ink/45">Pipeline total </span>
                <span className="font-semibold">{formatUsd(pipelineValue)}</span>
              </p>
              <p>
                <span className="text-okapi-ink/45">Restant à closer </span>
                <span className="font-semibold">{formatUsd(remaining)}</span>
              </p>
              {overTargetPct > 0 ? (
                <p className="text-xs font-medium text-okapi-amber-deep">
                  {overTargetPct.toFixed(1)}% au-dessus de l’objectif
                </p>
              ) : (
                <p className="text-xs font-medium text-okapi-forest">
                  Sous l’objectif — accélérer les propositions
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-okapi-ink/40">
            Barres : total · actifs · objectif
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[var(--okapi-stroke)] bg-white/75">
          <div className="bg-okapi-leaf/15 px-5 py-3">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Relances en retard
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-okapi-ink/40">
                <tr>
                  <th className="px-4 py-2 font-medium">Retard</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Échéance</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {overdue.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-okapi-ink/40"
                    >
                      Aucune relance en retard
                    </td>
                  </tr>
                ) : (
                  overdue.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--okapi-stroke)]"
                    >
                      <td className="px-4 py-2.5 font-semibold text-okapi-amber-deep">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-okapi-amber-deep" />
                        {c.overdueDays} j
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{c.nextAction}</p>
                        <p className="text-xs text-okapi-ink/40">{c.company}</p>
                      </td>
                      <td className="px-4 py-2.5 text-okapi-ink/60">
                        {formatFrDate(c.deadline)}
                      </td>
                      <td className="px-4 py-2.5">{c.owner}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Workload + upcoming */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Charge équipe
          </h3>
          <div className="mt-5 flex h-40 items-end justify-between gap-2 px-1">
            {TEAM_LOAD.map((t) => (
              <div key={t.name} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] font-semibold text-okapi-ink/50">
                  {t.pct}%
                </span>
                <div
                  className="w-full max-w-[40px] rounded-t-md bg-okapi-amber"
                  style={{ height: `${(t.pct / maxBar) * 100}%` }}
                />
                <span className="truncate text-[11px] font-medium text-okapi-ink/70">
                  {t.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[var(--okapi-stroke)] bg-white/75">
          <div className="bg-okapi-amber/20 px-5 py-3">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Prochains rendez-vous
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-okapi-ink/40">
                <tr>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Charge</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--okapi-stroke)]"
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-okapi-ink/40">{c.owner}</p>
                    </td>
                    <td className="px-4 py-2.5 text-okapi-ink/70">
                      {c.nextAction}
                    </td>
                    <td className="px-4 py-2.5">{formatFrDate(c.deadline)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-okapi-mist">
                          <div
                            className="h-full rounded-full bg-okapi-forest"
                            style={{ width: `${c.workloadPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-okapi-ink/45">
                          {c.workloadPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Full client list */}
      <section className="overflow-hidden rounded-3xl border border-[var(--okapi-stroke)] bg-white/75">
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Tous les clients ({filtered.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-okapi-mist/80 text-xs uppercase tracking-wide text-okapi-ink/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Étape</th>
                <th className="px-4 py-2.5 font-medium">Valeur</th>
                <th className="px-4 py-2.5 font-medium">Ville</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-[var(--okapi-stroke)]"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold">{c.company}</p>
                    <p className="text-xs text-okapi-ink/45">{c.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-okapi-forest/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-okapi-forest">
                      {STAGE_LABEL[c.stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatUsd(c.valueUsd)}
                  </td>
                  <td className="px-4 py-3 text-okapi-ink/60">{c.city}</td>
                  <td className="px-4 py-3">{c.owner}</td>
                  <td className="px-4 py-3">
                    {c.stage !== "active" ? (
                      <button
                        type="button"
                        onClick={() => bumpStage(c.id)}
                        className="rounded-xl border border-[var(--okapi-stroke)] px-2.5 py-1 text-xs font-semibold text-okapi-forest hover:bg-okapi-mist"
                      >
                        Avancer →
                      </button>
                    ) : (
                      <span className="text-xs text-okapi-ink/35">Actif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
