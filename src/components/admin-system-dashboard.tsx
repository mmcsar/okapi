"use client";

import { useCallback, useEffect, useState } from "react";
import { GeminiStatus } from "@/components/gemini-status";
import { HeygenStatus } from "@/components/heygen-status";
import { SupabaseStatus } from "@/components/supabase-status";
import { kycStatusLabel } from "@/lib/kyc";

type OverviewCounts = {
  users: number;
  usersWeek: number;
  projects: number;
  projectsToday: number;
  subscriptionsActive: number;
  kycPending: number;
  paymentsPending: number;
};

type RecentUser = {
  id: string;
  name: string;
  city: string;
  kycStatus: string;
  createdAt: string | null;
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

export function AdminSystemDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [llmProvider, setLlmProvider] = useState<string>("—");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        counts?: OverviewCounts;
        recentUsers?: RecentUser[];
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
        setCounts(null);
        setRecentUsers([]);
        return;
      }
      setCounts(json.counts ?? null);
      setRecentUsers(json.recentUsers ?? []);
    } catch {
      setError("Synthèse système indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Affiche seulement le provider forcé côté client si exposé — sinon label neutre
    setLlmProvider(
      typeof process !== "undefined"
        ? "Voir env serveur (LLM_PROVIDER)"
        : "env serveur",
    );
  }, [load]);

  const systemRows = [
    { name: "App publique /", status: "OK" },
    { name: "Base Okapi", status: counts ? "OK" : loading ? "…" : "Config" },
    { name: "Moteur IA", status: "Config" },
    { name: "PWA", status: "OK" },
  ] as const;

  const stats = counts
    ? [
        {
          label: "Utilisateurs app",
          value: fmtInt(counts.users),
          hint:
            counts.usersWeek > 0
              ? `+${fmtInt(counts.usersWeek)} cette semaine`
              : "Comptes profils",
        },
        {
          label: "Projets générés",
          value: fmtInt(counts.projects),
          hint: `${fmtInt(counts.projectsToday)} aujourd’hui`,
        },
        {
          label: "Abonnements actifs",
          value: fmtInt(counts.subscriptionsActive),
          hint: `${fmtInt(counts.paymentsPending)} paiements en attente`,
        },
        {
          label: "KYC en attente",
          value: fmtInt(counts.kycPending),
          hint: "Identités à valider",
        },
      ]
    : [];

  return (
    <>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-amber-deep">
        Technique · secret
      </p>
      <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
        Architecture & APIs
      </h2>
      <p className="mb-5 mt-1 text-sm text-okapi-ink/55">
        Invisible pour les utilisateurs. Clés uniquement dans Vercel /
        `.env.local` — jamais dans l’app publique.
      </p>

      <section className="mb-5 rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Connexions API
            </h3>
            <p className="mt-1 text-sm text-okapi-ink/45">
              Provider actif côté serveur :{" "}
              <code className="text-okapi-forest">LLM_PROVIDER</code> ({llmProvider})
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/80 px-3 py-1.5 text-xs font-semibold"
          >
            Rafraîchir chiffres
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SupabaseStatus />
          <GeminiStatus />
          <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-4 py-3 text-left">
            <p className="text-sm font-semibold">OpenRouter</p>
            <p className="mt-1 text-xs text-okapi-ink/45">
              Variable :{" "}
              <code className="text-okapi-forest">OPENROUTER_API_KEY</code>
            </p>
            <p className="mt-2 text-xs font-medium text-okapi-ink/45">
              Fallback si Anthropic absent
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-4 py-3 text-left">
            <p className="text-sm font-semibold">Claude / Anthropic</p>
            <p className="mt-1 text-xs text-okapi-ink/45">
              Variable :{" "}
              <code className="text-okapi-forest">ANTHROPIC_API_KEY</code>
            </p>
            <p className="mt-2 text-xs font-medium text-okapi-forest">
              Chat · Studio · Preview
            </p>
          </div>
          <HeygenStatus />
          <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-4 py-3 text-left">
            <p className="text-sm font-semibold">Clé service base</p>
            <p className="mt-1 text-xs text-okapi-ink/45">
              Variable serveur pour le CRM admin
            </p>
            <p className="mt-2 text-xs font-medium text-okapi-ink/45">
              CRM onglet Clients
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <p className="mb-4 text-sm text-okapi-ink/50">Chargement des compteurs…</p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-2xl border border-okapi-amber/30 bg-okapi-amber/10 px-4 py-3 text-sm text-okapi-amber-deep">
          {error}
        </p>
      ) : null}

      {stats.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-okapi-ink/40">
                {stat.label}
              </p>
              <p className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-bold">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-okapi-ink/45">{stat.hint}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Utilisateurs app récents
          </h2>
          <ul className="mt-4 space-y-2">
            {recentUsers.length === 0 ? (
              <li className="text-sm text-okapi-ink/45">
                Aucun compte chargé.
              </li>
            ) : (
              recentUsers.map((user) => (
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
                  <span className="rounded-full bg-okapi-forest/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-okapi-forest">
                    {kycStatusLabel(user.kycStatus)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            Stack
          </h2>
          <ul className="mt-3 space-y-2">
            {systemRows.map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-okapi-ink/65">{row.name}</span>
                <span
                  className={
                    row.status === "OK"
                      ? "font-medium text-okapi-forest"
                      : "font-medium text-okapi-amber-deep"
                  }
                >
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
