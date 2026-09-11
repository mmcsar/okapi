"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CLIENT_STAGES,
  formatFrDate,
  formatUsd,
  SEED_CLIENTS,
  type AdminClient,
  type ClientStage,
} from "@/data/admin-clients";

const STAGE_LABEL: Record<ClientStage, string> = {
  prospect: "Prospect",
  qualified: "Qualifié",
  proposal: "Proposition",
  active: "Actif",
};

const STAGE_ORDER: ClientStage[] = [
  "prospect",
  "qualified",
  "proposal",
  "active",
];

const emptyForm = {
  name: "",
  company: "",
  city: "Kinshasa",
  owner: "Christian",
  valueUsd: "2000",
  nextAction: "Premier contact",
  deadline: "",
};

export function AdminClientsDashboard() {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<ClientStage | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/admin/clients");
      const data = (await res.json()) as {
        ok?: boolean;
        clients?: AdminClient[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSetupError(data.error ?? "Impossible de charger les clients.");
        setClients(SEED_CLIENTS);
        return;
      }
      setClients(data.clients ?? []);
    } catch {
      setSetupError("Erreur réseau — fallback démo local.");
      setClients(SEED_CLIENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.owner.toLowerCase().includes(q)
      );
    });
  }, [clients, query, stageFilter]);

  const selected = clients.find((c) => c.id === selectedId) ?? null;

  const teamLoad = useMemo(() => {
    const map = new Map<string, { total: number; n: number; value: number }>();
    for (const c of clients) {
      const cur = map.get(c.owner) ?? { total: 0, n: 0, value: 0 };
      cur.total += c.workloadPct;
      cur.n += 1;
      cur.value += c.valueUsd;
      map.set(c.owner, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({
        name,
        pct: Math.round(v.total / Math.max(v.n, 1)),
        count: v.n,
        value: v.value,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
  }, [clients]);

  const pipelineValue = clients.reduce((s, c) => s + c.valueUsd, 0);
  const activeValue = clients
    .filter((c) => c.stage === "active")
    .reduce((s, c) => s + c.valueUsd, 0);
  const remaining = Math.max(pipelineValue - activeValue, 0);
  const target = Math.round(pipelineValue * 0.75 || 1);
  const progressToTarget = Math.min(
    100,
    Math.round((activeValue / target) * 100),
  );
  const overdueCount = clients.filter((c) => c.overdueDays > 0).length;

  const stageCounts = CLIENT_STAGES.map((s) => ({
    ...s,
    count: clients.filter((c) => c.stage === s.id).length,
    value: clients
      .filter((c) => c.stage === s.id)
      .reduce((sum, c) => sum + c.valueUsd, 0),
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

  const maxBar = Math.max(...teamLoad.map((t) => t.pct), 1);
  const maxBudget = Math.max(pipelineValue, activeValue, target, 1);

  async function addClient() {
    if (!form.name.trim() || !form.company.trim() || saving) return;
    setSaving(true);
    try {
      const deadline =
        form.deadline ||
        new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          company: form.company.trim(),
          city: form.city.trim() || "Kinshasa",
          owner: form.owner.trim() || "Christian",
          valueUsd: Number(form.valueUsd) || 0,
          nextAction: form.nextAction.trim() || "Premier contact",
          deadline,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        client?: AdminClient;
        error?: string;
      };
      if (!res.ok || !data.client) {
        setSetupError(data.error ?? "Échec création client.");
        return;
      }
      setClients((prev) => [data.client!, ...prev]);
      setSelectedId(data.client.id);
      setShowForm(false);
      setForm(emptyForm);
      setSetupError(null);
    } finally {
      setSaving(false);
    }
  }

  async function bumpStage(id: string) {
    const current = clients.find((c) => c.id === id);
    if (!current || current.stage === "active") return;
    const i = STAGE_ORDER.indexOf(current.stage);
    const next = STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];

    setClients((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, stage: next, overdueDays: 0 } : c,
      ),
    );

    const res = await fetch(`/api/admin/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next, overdueDays: 0 }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      client?: AdminClient;
      error?: string;
    };
    if (!res.ok || !data.client) {
      setSetupError(data.error ?? "Échec mise à jour.");
      void load();
      return;
    }
    setClients((prev) => prev.map((c) => (c.id === id ? data.client! : c)));
  }

  async function removeClient(id: string) {
    if (!confirm("Supprimer ce client ?")) return;
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    const res = await fetch(`/api/admin/clients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setSetupError(data?.error ?? "Échec suppression.");
      void load();
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-okapi-amber-deep">
            CRM · Admin
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight text-okapi-ink">
            Tableau de bord clients
          </h2>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Pipeline commercial, relances et charge équipe
            {loading ? " · chargement…" : ` · ${clients.length} fiches`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/80 px-3.5 py-2.5 text-sm font-medium text-okapi-ink/70 hover:bg-white"
          >
            Rafraîchir
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-2xl bg-okapi-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-okapi-amber-deep"
          >
            {showForm ? "Fermer" : "+ Nouveau client"}
          </button>
        </div>
      </div>

      {setupError ? (
        <div className="rounded-2xl border border-okapi-amber/30 bg-okapi-amber/10 px-4 py-3 text-sm text-okapi-ink/80">
          {setupError}
          <p className="mt-1 text-xs text-okapi-ink/50">
            SQL : <code>20260309_admin_clients.sql</code> · Env :{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>
          </p>
        </div>
      ) : null}

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Clients"
          value={String(clients.length)}
          hint={`${stageCounts.find((s) => s.id === "active")?.count ?? 0} actifs`}
        />
        <Kpi
          label="Pipeline"
          value={formatUsd(pipelineValue)}
          hint={`${formatUsd(remaining)} à closer`}
        />
        <Kpi
          label="CA actifs"
          value={formatUsd(activeValue)}
          hint={`${progressToTarget}% de l’objectif`}
          accent
        />
        <Kpi
          label="Relances tard"
          value={String(overdueCount)}
          hint={overdueCount ? "À traiter aujourd’hui" : "Tout est à jour"}
          warn={overdueCount > 0}
        />
      </section>

      {/* Pipeline stages */}
      <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5 shadow-sm backdrop-blur-sm lg:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Parcours client
          </h3>
          <p className="text-xs text-okapi-ink/45">
            Clique une étape pour filtrer la liste
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-6 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-7 hidden h-0.5 bg-okapi-mist lg:block" />
          {stageCounts.map((s) => {
            const activeFilter = stageFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setStageFilter((cur) => (cur === s.id ? "all" : s.id))
                }
                className={`relative z-[1] text-center transition ${
                  activeFilter ? "scale-[1.02]" : "opacity-90 hover:opacity-100"
                }`}
              >
                <div className="mx-auto flex h-16 items-center justify-center">
                  {s.status === "done" ? (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-okapi-forest text-xl text-white shadow-md shadow-okapi-forest/25">
                      ✓
                    </span>
                  ) : s.status === "progress" ? (
                    <span
                      className="flex h-16 w-16 items-center justify-center rounded-full shadow-md"
                      style={{
                        background: `conic-gradient(#e8892a ${proposalPct}%, #e8eee9 0)`,
                      }}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-bold">
                        {proposalPct}%
                      </span>
                    </span>
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-okapi-ink/20 bg-okapi-mist text-okapi-ink/35">
                      ⏱
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm font-bold">{s.label}</p>
                <p className="mt-0.5 text-xs text-okapi-ink/45">
                  {s.count} · {formatUsd(s.value)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-okapi-ink/35">
                  {s.status === "done"
                    ? "Complété"
                    : s.status === "progress"
                      ? "En cours"
                      : "En attente"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {showForm ? (
        <div className="rounded-[28px] border border-okapi-amber/25 bg-okapi-amber/5 p-5">
          <h3 className="font-[family-name:var(--font-syne)] text-base font-bold">
            Nouveau client
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  className="w-full rounded-xl border border-[var(--okapi-stroke)] bg-white px-3 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void addClient()}
            disabled={saving}
            className="mt-4 rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      ) : null}

      {/* Middle: budget + overdue + goal */}
      <section className="grid gap-4 xl:grid-cols-[1.1fr_1.2fr_0.85fr]">
        <article className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Pipeline commercial
          </h3>
          <div className="mt-5 flex items-end gap-6">
            <div className="flex h-40 items-end gap-3">
              {[
                { label: "Total", value: pipelineValue, color: "bg-okapi-leaf" },
                {
                  label: "Actifs",
                  value: activeValue,
                  color: "bg-okapi-forest",
                },
                { label: "Cible", value: target, color: "bg-okapi-amber" },
              ].map((b) => (
                <div
                  key={b.label}
                  className="flex w-14 flex-col items-center gap-2"
                >
                  <div
                    className={`w-full rounded-t-lg ${b.color}`}
                    style={{
                      height: `${Math.max((b.value / maxBudget) * 100, 6)}%`,
                    }}
                    title={formatUsd(b.value)}
                  />
                  <span className="text-[10px] font-medium text-okapi-ink/50">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 space-y-3 text-sm">
              <StatLine label="Pipeline total" value={formatUsd(pipelineValue)} />
              <StatLine label="Restant à closer" value={formatUsd(remaining)} />
              <div>
                <div className="mb-1 flex justify-between text-xs text-okapi-ink/45">
                  <span>Objectif</span>
                  <span>{progressToTarget}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-okapi-mist">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-okapi-forest to-okapi-amber"
                    style={{ width: `${progressToTarget}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80">
          <div className="flex items-center justify-between bg-okapi-leaf/15 px-5 py-3.5">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Relances en retard
            </h3>
            <span className="rounded-full bg-okapi-amber/20 px-2.5 py-0.5 text-xs font-bold text-okapi-amber-deep">
              {overdue.length}
            </span>
          </div>
          <div className="max-h-56 overflow-auto">
            {overdue.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-okapi-ink/40">
                Aucune relance en retard ✨
              </p>
            ) : (
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-okapi-ink/40">
                  <tr>
                    <th className="px-4 py-2 font-medium">Retard</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                    <th className="px-4 py-2 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t border-[var(--okapi-stroke)] hover:bg-okapi-mist/50"
                      onClick={() => setSelectedId(c.id)}
                    >
                      <td className="px-4 py-2.5 font-bold text-okapi-amber-deep">
                        {c.overdueDays} j
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{c.nextAction}</p>
                        <p className="text-xs text-okapi-ink/40">{c.company}</p>
                      </td>
                      <td className="px-4 py-2.5">{c.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        <article className="flex flex-col justify-between rounded-[28px] bg-gradient-to-br from-okapi-forest to-okapi-leaf p-5 text-white shadow-lg shadow-okapi-forest/20">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
              Objectif trimestre
            </p>
            <p className="mt-4 font-[family-name:var(--font-syne)] text-4xl font-bold">
              {formatUsd(target)}
            </p>
            <p className="mt-2 text-sm text-white/75">
              CA clients actifs cible
            </p>
          </div>
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs text-white/70">
              <span>Atteint</span>
              <span>{formatUsd(activeValue)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-okapi-amber"
                style={{ width: `${progressToTarget}%` }}
              />
            </div>
          </div>
        </article>
      </section>

      {/* Workload + upcoming */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Charge équipe
          </h3>
          {teamLoad.length === 0 ? (
            <p className="mt-8 text-sm text-okapi-ink/40">Aucun owner</p>
          ) : (
            <div className="mt-6 flex h-44 items-end justify-between gap-3 px-1">
              {teamLoad.map((t) => (
                <div
                  key={t.name}
                  className="group flex flex-1 flex-col items-center gap-2"
                  title={`${t.count} clients · ${formatUsd(t.value)}`}
                >
                  <span className="text-[11px] font-bold text-okapi-ink/55">
                    {t.pct}%
                  </span>
                  <div
                    className="w-full max-w-[48px] rounded-t-xl bg-gradient-to-t from-okapi-amber-deep to-okapi-amber transition group-hover:brightness-110"
                    style={{ height: `${(t.pct / maxBar) * 100}%` }}
                  />
                  <span className="truncate text-xs font-semibold text-okapi-ink/70">
                    {t.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="overflow-hidden rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80">
          <div className="bg-okapi-amber/20 px-5 py-3.5">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Prochains rendez-vous
            </h3>
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-okapi-ink/40">
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
                    className="cursor-pointer border-t border-[var(--okapi-stroke)] hover:bg-okapi-mist/40"
                    onClick={() => setSelectedId(c.id)}
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
        </article>
      </section>

      {/* List + detail */}
      <section className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
        <article className="overflow-hidden rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--okapi-stroke)] px-5 py-3.5">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Tous les clients
              <span className="ml-2 text-sm font-medium text-okapi-ink/40">
                ({filtered.length})
              </span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-okapi-mist/80 p-0.5">
                <button
                  type="button"
                  onClick={() => setStageFilter("all")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    stageFilter === "all"
                      ? "bg-white text-okapi-forest shadow-sm"
                      : "text-okapi-ink/45"
                  }`}
                >
                  Tous
                </button>
                {CLIENT_STAGES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStageFilter(s.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      stageFilter === s.id
                        ? "bg-white text-okapi-forest shadow-sm"
                        : "text-okapi-ink/45"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="w-40 rounded-xl border border-[var(--okapi-stroke)] bg-white px-3 py-1.5 text-sm outline-none focus:border-okapi-leaf/40"
              />
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="sticky top-0 bg-okapi-mist/95 text-[11px] uppercase tracking-wide text-okapi-ink/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Étape</th>
                  <th className="px-4 py-2.5 font-medium">Valeur</th>
                  <th className="px-4 py-2.5 font-medium">Ville</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`cursor-pointer border-t border-[var(--okapi-stroke)] transition ${
                      selectedId === c.id
                        ? "bg-okapi-forest/5"
                        : "hover:bg-okapi-mist/40"
                    }`}
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
                    <td className="px-4 py-3 text-right">
                      {c.stage !== "active" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void bumpStage(c.id);
                          }}
                          className="rounded-xl border border-[var(--okapi-stroke)] px-2.5 py-1 text-xs font-semibold text-okapi-forest hover:bg-white"
                        >
                          Avancer →
                        </button>
                      ) : (
                        <span className="text-xs text-okapi-ink/30">Actif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-5">
          {selected ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-amber-deep">
                Fiche client
              </p>
              <h3 className="mt-2 font-[family-name:var(--font-syne)] text-xl font-bold">
                {selected.company}
              </h3>
              <p className="mt-1 text-sm text-okapi-ink/55">{selected.name}</p>

              <dl className="mt-5 space-y-3 text-sm">
                <Detail label="Étape" value={STAGE_LABEL[selected.stage]} />
                <Detail label="Valeur" value={formatUsd(selected.valueUsd)} />
                <Detail label="Ville" value={selected.city} />
                <Detail label="Owner" value={selected.owner} />
                <Detail label="Prochaine action" value={selected.nextAction} />
                <Detail
                  label="Échéance"
                  value={formatFrDate(selected.deadline)}
                />
                <Detail
                  label="Retard"
                  value={
                    selected.overdueDays > 0
                      ? `${selected.overdueDays} jours`
                      : "À jour"
                  }
                />
              </dl>

              <div className="mt-6 flex flex-wrap gap-2">
                {selected.stage !== "active" ? (
                  <button
                    type="button"
                    onClick={() => void bumpStage(selected.id)}
                    className="rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Avancer l’étape
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeClient(selected.id)}
                  className="rounded-2xl border border-okapi-mahogany/30 px-4 py-2.5 text-sm font-semibold text-okapi-mahogany"
                >
                  Supprimer
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <p className="font-[family-name:var(--font-syne)] text-lg font-bold text-okapi-ink/40">
                Sélectionne un client
              </p>
              <p className="mt-2 max-w-[220px] text-sm text-okapi-ink/35">
                Clique une ligne pour voir la fiche, avancer l’étape ou
                supprimer.
              </p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <article
      className={`rounded-[24px] border p-5 ${
        accent
          ? "border-okapi-forest/20 bg-okapi-forest text-white"
          : warn
            ? "border-okapi-amber/30 bg-okapi-amber/10"
            : "border-[var(--okapi-stroke)] bg-white/80"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
          accent ? "text-white/65" : "text-okapi-ink/40"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight lg:text-3xl">
        {value}
      </p>
      <p className={`mt-1 text-xs ${accent ? "text-white/70" : "text-okapi-ink/45"}`}>
        {hint}
      </p>
    </article>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-okapi-ink/45">{label}</span>
      <span className="font-semibold">{value}</span>
    </p>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--okapi-stroke)] pb-2">
      <dt className="text-okapi-ink/40">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
