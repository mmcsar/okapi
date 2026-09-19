"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
};

const createItems: NavItem[] = [
  {
    id: "home",
    label: "Agent",
    hint: "2 modes",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
      </svg>
    ),
  },
  {
    id: "studio",
    label: "Studio",
    hint: "Builders",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5h7v14H4zM13 5h7v6h-7zM13 13h7v6h-7z" />
      </svg>
    ),
  },
  {
    id: "projects",
    label: "Projets",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7h16v12H4z" />
        <path d="M8 7V5h8v2" />
      </svg>
    ),
  },
  {
    id: "automations",
    label: "Automatisations",
    hint: "Tâches",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 1.5" />
      </svg>
    ),
  },
];

const accountItems: NavItem[] = [
  {
    id: "billing",
    label: "Abonnement",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18M7 14h3" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Paramètres",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
      </svg>
    ),
  },
];

type SidebarProps = {
  activeNav: string;
  onNavChange: (id: string) => void;
  onNewProject?: () => void;
  userLabel?: string;
  loggedIn?: boolean;
  /** Mode Studio — rail plus étroit, coins moins soft. */
  compact?: boolean;
};

export function Sidebar({
  activeNav,
  onNavChange,
  onNewProject,
  userLabel = "Invité",
  loggedIn = false,
  compact = false,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onResize() {
      if (window.matchMedia("(min-width: 768px)").matches) {
        setMobileOpen(false);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function go(id: string) {
    onNavChange(id);
    setMobileOpen(false);
  }

  function newChat() {
    onNewProject?.();
    setMobileOpen(false);
  }

  function renderNav(items: NavItem[]) {
    return items.map((item) => {
      const active = activeNav === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => go(item.id)}
          aria-current={active ? "page" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
            active
              ? "bg-okapi-forest text-white"
              : "text-okapi-ink/65 hover:bg-white/70 hover:text-okapi-ink"
          }`}
        >
          <span className={active ? "opacity-100" : "opacity-70"}>{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint ? (
            <span
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                active ? "bg-white/20 text-white/90" : "bg-okapi-mist text-okapi-ink/40"
              }`}
            >
              {item.hint}
            </span>
          ) : null}
        </button>
      );
    });
  }

  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex items-center gap-3 px-1 ${compact ? "px-0.5" : ""}`}>
        <div
          className={`relative overflow-hidden ring-1 ring-[var(--okapi-stroke)] ${
            compact ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl"
          }`}
        >
          <Image
            src="/okapi-logo.png"
            alt="Logo Okapi"
            fill
            sizes="44px"
            className="object-cover object-[48%_28%]"
            priority
          />
        </div>
        <div className={compact ? "min-w-0" : undefined}>
          <p
            className={`font-[family-name:var(--font-syne)] font-bold leading-none tracking-tight ${
              compact ? "text-base" : "text-xl"
            }`}
          >
            Okapi
          </p>
          {!compact ? (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-okapi-ink/40">
              MMC SARL
            </p>
          ) : (
            <p className="mt-0.5 truncate text-[10px] text-okapi-ink/40">Studio</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={newChat}
        className={`mt-4 flex w-full items-center justify-center gap-2 bg-okapi-amber text-sm font-semibold text-white transition hover:bg-okapi-amber-deep ${
          compact
            ? "rounded-xl px-3 py-2.5"
            : "mt-5 rounded-2xl px-4 py-3 shadow-sm"
        }`}
      >
        <span className="text-base leading-none">+</span>
        {compact ? "Nouveau" : "Nouvelle conversation"}
      </button>

      <nav
        className={`flex-1 space-y-3 ${compact ? "mt-3" : "mt-5 space-y-4"}`}
        aria-label="Navigation Okapi"
      >
        <div className="space-y-0.5">
          {!compact ? (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-okapi-ink/35">
              Créer
            </p>
          ) : null}
          {renderNav(createItems)}
        </div>
        <div className="space-y-0.5">
          {!compact ? (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-okapi-ink/35">
              Compte
            </p>
          ) : null}
          {renderNav(accountItems)}
        </div>
      </nav>

      <div
        className={`mt-auto border border-[var(--okapi-stroke)] bg-white/55 ${
          compact ? "rounded-xl p-1" : "rounded-2xl p-1.5"
        }`}
      >
        {!compact ? (
        <div className="flex items-center gap-2 rounded-xl bg-okapi-amber/15 px-2 py-2">
          <div className="relative h-8 w-8 overflow-hidden rounded-full">
            <Image
              src="/okapi-logo.png"
              alt=""
              fill
              sizes="32px"
              className="object-cover object-[48%_26%]"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Okapi</p>
            <p className="truncate text-[11px] text-okapi-ink/45">
              Plateforme IA · MMC SARL
            </p>
          </div>
        </div>
        ) : null}
        <button
          type="button"
          onClick={() => go("login")}
          className="mt-0.5 flex w-full items-center gap-2 px-2 py-2 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-okapi-forest text-xs font-bold text-white">
            {(userLabel || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userLabel}</p>
            <p className="truncate text-[11px] text-okapi-ink/40">
              {loggedIn ? "Compte" : "Se connecter"}
            </p>
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={`fixed z-[80] rounded-xl border border-[var(--okapi-stroke)] bg-white px-3 py-2 text-sm font-semibold shadow-md md:hidden ${
          compact ? "left-3 top-3" : "left-4 top-4"
        }`}
        onClick={() => setMobileOpen(true)}
      >
        Menu
      </button>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-[70] bg-okapi-ink/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`relative z-[40] hidden shrink-0 md:flex md:flex-col ${
          compact
            ? "w-[200px] border-r border-[var(--okapi-stroke)] bg-[rgba(243,246,243,0.92)] p-2.5 backdrop-blur-md"
            : "w-[260px] md:rounded-[28px] md:border md:border-[var(--okapi-stroke)] md:bg-[var(--okapi-glass)] md:p-3.5 md:backdrop-blur-xl"
        }`}
      >
        {content}
      </aside>

      <aside
        className={`fixed inset-y-3 left-3 z-[80] flex w-[min(86vw,280px)] flex-col rounded-[28px] border border-[var(--okapi-stroke)] bg-white p-3.5 shadow-2xl transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-[130%]"
        }`}
      >
        {content}
      </aside>
    </>
  );
}
