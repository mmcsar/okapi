"use client";

import Image from "next/image";
import { useState } from "react";

type Agent = {
  id: string;
  name: string;
  role: string;
  sector: string;
  description: string;
  active: boolean;
};

const initialAgents: Agent[] = [
  {
    id: "okapi",
    name: "Agent Okapi",
    role: "IA autonome",
    sector: "Tout",
    description:
      "Plateforme IA de MMC SARL : répond, construit sites & apps, et corrige les bugs (mode Debug).",
    active: true,
  },
  {
    id: "builder",
    name: "Agent Builder",
    role: "Génération d’apps",
    sector: "Tous",
    description:
      "Transforme un prompt en site ou mini-app (UI + preview). Fullstack + Studio Dev Okapi.",
    active: true,
  },
  {
    id: "restaurant",
    name: "Agent Restaurant",
    role: "Menu & commandes",
    sector: "Restaurant",
    description: "Menus, réservations, commandes et Mobile Money.",
    active: true,
  },
  {
    id: "univ",
    name: "Agent Université",
    role: "Inscriptions & planning",
    sector: "Université",
    description: "Formulaires d’inscription, notes et emplois du temps.",
    active: false,
  },
  {
    id: "boutique",
    name: "Agent Boutique",
    role: "E-commerce simple",
    sector: "Boutique",
    description: "Catalogue, panier et checkout adaptés à la RDC.",
    active: true,
  },
  {
    id: "mining",
    name: "Agent Mining",
    role: "Suivi chantier",
    sector: "Mining",
    description: "Stocks, rapports site et suivi d’équipe.",
    active: false,
  },
  {
    id: "designer",
    name: "Agent Design",
    role: "UI & style",
    sector: "Design",
    description: "Couleurs, typo et mise en page cohérente avec la marque.",
    active: true,
  },
];

type AgentsPanelProps = {
  onBack?: () => void;
  onStartBuild?: () => void;
};

export function AgentsPanel({ onBack, onStartBuild }: AgentsPanelProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [selectedId, setSelectedId] = useState("okapi");
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];

  function toggleAgent(id: string) {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
    );
  }

  const activeCount = agents.filter((a) => a.active).length;

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 overflow-hidden rounded-2xl ring-1 ring-[var(--okapi-stroke)]">
            <Image
              src="/okapi-logo.png"
              alt=""
              fill
              sizes="44px"
              className="object-cover object-[48%_26%]"
            />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
              Agents Okapi
            </h1>
            <p className="mt-0.5 text-sm text-okapi-ink/50">
              Plateforme IA MMC SARL · {activeCount} actifs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm font-medium text-okapi-ink/70"
            >
              Retour
            </button>
          ) : null}
          <button
            type="button"
            onClick={onStartBuild}
            className="rounded-2xl bg-okapi-amber px-4 py-2 text-sm font-semibold text-white hover:bg-okapi-amber-deep"
          >
            Construire avec eux
          </button>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {agents.map((agent) => {
              const selectedCard = agent.id === selectedId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedId(agent.id)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    selectedCard
                      ? "border-okapi-forest/40 bg-white"
                      : "border-[var(--okapi-stroke)] bg-white/65 hover:bg-white/90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-[family-name:var(--font-syne)] text-base font-bold">
                        {agent.name}
                      </p>
                      <p className="mt-1 text-xs text-okapi-ink/45">{agent.role}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        agent.active
                          ? "bg-okapi-forest/10 text-okapi-forest"
                          : "bg-okapi-ink/5 text-okapi-ink/40"
                      }`}
                    >
                      {agent.active ? "Actif" : "Off"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-okapi-ink/55">
                    {agent.description}
                  </p>
                  <p className="mt-3 text-[11px] font-medium text-okapi-ink/35">
                    Secteur · {agent.sector}
                  </p>
                </button>
              );
            })}
          </div>

          <aside className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5 h-fit">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-ink/35">
              Détail agent
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-syne)] text-xl font-bold">
              {selected.name}
            </h2>
            <p className="mt-2 text-sm text-okapi-ink/55">{selected.description}</p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/70 px-4 py-3">
                <p className="text-xs text-okapi-ink/45">Rôle</p>
                <p className="mt-1 text-sm font-semibold">{selected.role}</p>
              </div>
              <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/70 px-4 py-3">
                <p className="text-xs text-okapi-ink/45">Secteur</p>
                <p className="mt-1 text-sm font-semibold">{selected.sector}</p>
              </div>
              <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/70 px-4 py-3">
                <p className="text-xs text-okapi-ink/45">Capacités</p>
                <p className="mt-1 text-sm text-okapi-ink/70">
                  {selected.id === "okapi"
                    ? "Questions libres · explications · code · business RDC"
                    : "Prompt → structure · UI · templates RDC"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggleAgent(selected.id)}
              className={`mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                selected.active
                  ? "border border-[var(--okapi-stroke)] bg-white text-okapi-ink"
                  : "bg-okapi-forest text-white"
              }`}
            >
              {selected.active ? "Désactiver cet agent" : "Activer cet agent"}
            </button>

            <button
              type="button"
              onClick={onStartBuild}
              className="mt-2 w-full rounded-2xl bg-okapi-amber px-4 py-3 text-sm font-semibold text-white hover:bg-okapi-amber-deep"
            >
              Lancer sur le tableau de bord
            </button>

            <p className="mt-4 text-[11px] leading-relaxed text-okapi-ink/40">
              Okapi peut se tromper. L’agent répond comme une IA générale et
              peut aussi construire des apps — ce n’est ni un médecin ni un juriste.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
