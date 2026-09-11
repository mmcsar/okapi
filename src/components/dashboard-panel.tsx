"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { UserMenu } from "@/components/user-menu";
import { SupabaseStatus } from "@/components/supabase-status";

const stats = [
  { label: "Projets", value: "12", hint: "+3 cette semaine" },
  { label: "Agents actifs", value: "4", hint: "sur 6 configurés" },
  { label: "Artifacts", value: "8", hint: "3 prêts à exporter" },
  { label: "Planifiés", value: "2", hint: "prochaine : demain" },
] as const;

const recentProjects = [
  {
    title: "Boutique café Gombe",
    sector: "Boutique",
    status: "Prêt",
    updated: "Il y a 2 h",
  },
  {
    title: "Menu restaurant Lingwala",
    sector: "Restaurant",
    status: "En cours",
    updated: "Il y a 5 h",
  },
  {
    title: "Landing école Kinshasa",
    sector: "Site web",
    status: "Prêt",
    updated: "Hier",
  },
  {
    title: "Suivi stock mining light",
    sector: "Mining",
    status: "Brouillon",
    updated: "Hier",
  },
] as const;

const agentSnapshot = [
  { name: "Builder", active: true },
  { name: "Restaurant", active: true },
  { name: "Boutique", active: true },
  { name: "Design", active: true },
  { name: "Université", active: false },
  { name: "Mining", active: false },
] as const;

const quickLinks = [
  { id: "build", label: "Nouveau projet", tone: "primary" as const },
  { id: "agents", label: "Gérer les agents", tone: "secondary" as const },
  { id: "projects", label: "Tous les projets", tone: "secondary" as const },
  { id: "artifacts", label: "Artifacts", tone: "secondary" as const },
] as const;

type DashboardPanelProps = {
  onNavigate: (id: string) => void;
  loggedIn?: boolean;
  onAuthToggle?: () => void;
};

function greetingFromHour(hour: number) {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function DashboardPanel({
  onNavigate,
  loggedIn = true,
  onAuthToggle,
}: DashboardPanelProps) {
  const [greeting, setGreeting] = useState("Bonjour");

  useEffect(() => {
    setGreeting(greetingFromHour(new Date().getHours()));
  }, []);

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div className="relative hidden max-w-md flex-1 md:block">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-okapi-ink/35">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Rechercher un projet, agent…"
            className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/75 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-okapi-ink/35 focus:border-okapi-leaf/35"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate("language")}
            className="hidden rounded-full border border-[var(--okapi-stroke)] bg-white/70 px-3 py-1 text-xs font-medium text-okapi-ink/55 sm:inline"
          >
            RDC · FR
          </button>
          <button
            type="button"
            onClick={() => onNavigate("build")}
            className="rounded-2xl bg-okapi-amber px-4 py-2 text-sm font-semibold text-white hover:bg-okapi-amber-deep"
          >
            + Créer
          </button>
          <UserMenu
            onNavigate={onNavigate}
            loggedIn={loggedIn}
            onAuthToggle={() => onAuthToggle?.()}
          />
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl ring-1 ring-[var(--okapi-stroke)]">
                <Image
                  src="/okapi-logo.png"
                  alt="Okapi"
                  fill
                  sizes="56px"
                  className="object-cover object-[48%_26%]"
                  priority
                />
              </div>
              <div>
                <h1 className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight sm:text-4xl">
                  {greeting}, Christian
                </h1>
                <p className="mt-1 text-sm text-okapi-ink/55 sm:text-base">
                  Voici ton tableau de bord Okapi — projets, agents et activité RDC.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => onNavigate(link.id)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    link.tone === "primary"
                      ? "bg-okapi-forest text-white"
                      : "border border-[var(--okapi-stroke)] bg-white/70 text-okapi-ink/70 hover:bg-white"
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 p-5"
              >
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-okapi-ink/40">
                  {stat.label}
                </p>
                <p className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-bold">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-okapi-ink/45">{stat.hint}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                  Projets récents
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate("projects")}
                  className="text-sm font-medium text-okapi-forest"
                >
                  Tout voir
                </button>
              </div>
              <ul className="mt-4 space-y-2">
                {recentProjects.map((project) => (
                  <li key={project.title}>
                    <button
                      type="button"
                      onClick={() => onNavigate("projects")}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/40 px-4 py-3 text-left transition hover:bg-white"
                    >
                      <div>
                        <p className="text-sm font-semibold">{project.title}</p>
                        <p className="mt-0.5 text-xs text-okapi-ink/45">
                          {project.sector} · {project.updated}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          project.status === "Prêt"
                            ? "bg-okapi-forest/10 text-okapi-forest"
                            : project.status === "En cours"
                              ? "bg-okapi-amber/15 text-okapi-amber-deep"
                              : "bg-okapi-ink/5 text-okapi-ink/45"
                        }`}
                      >
                        {project.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-5">
              <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                    Agents
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate("agents")}
                    className="text-sm font-medium text-okapi-forest"
                  >
                    Configurer
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {agentSnapshot.map((agent) => (
                    <span
                      key={agent.name}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        agent.active
                          ? "bg-okapi-forest text-white"
                          : "bg-okapi-mist text-okapi-ink/45"
                      }`}
                    >
                      {agent.name}
                    </span>
                  ))}
                </div>
              </div>

              <SupabaseStatus />

              <div className="rounded-[28px] border border-okapi-amber/20 bg-okapi-amber/5 p-5">
                <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                  Activité du jour
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-okapi-ink/65">
                  <li>3 projets mis à jour à Kinshasa</li>
                  <li>1 artifact exporté (Menu resto)</li>
                  <li>2 agents prêts pour une nouvelle génération</li>
                </ul>
                <p className="mt-4 text-[11px] leading-relaxed text-okapi-ink/40">
                  Okapi peut se tromper. Ce n’est ni un médecin ni un juriste.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/60 p-5">
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
              Secteurs RDC
            </h2>
            <p className="mt-1 text-sm text-okapi-ink/50">
              Lance un build ciblé depuis le tableau de bord.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Site web", "Restaurant", "Université", "Boutique", "Mining"].map(
                (sector) => (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => onNavigate("build")}
                    className="rounded-full border border-[var(--okapi-stroke)] bg-white/80 px-4 py-2 text-sm font-medium text-okapi-ink/70 transition hover:border-okapi-forest/30 hover:text-okapi-forest"
                  >
                    {sector}
                  </button>
                ),
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
