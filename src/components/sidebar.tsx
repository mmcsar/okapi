"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  {
    id: "home",
    label: "Agent",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
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
};

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
        active
          ? "bg-okapi-forest text-white"
          : "text-okapi-ink/65 hover:bg-white/70 hover:text-okapi-ink"
      }`}
    >
      <span className={active ? "opacity-100" : "opacity-70"}>{item.icon}</span>
      {item.label}
    </button>
  );
}

export function Sidebar({
  activeNav,
  onNavChange,
  onNewProject,
  userLabel = "Invité",
  loggedIn = false,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function go(id: string) {
    onNavChange(id);
    setMobileOpen(false);
  }

  const content = (
    <>
      <div className="flex items-center gap-3 px-1">
        <div className="relative h-11 w-11 overflow-hidden rounded-2xl ring-1 ring-[var(--okapi-stroke)]">
          <Image
            src="/okapi-logo.png"
            alt="Logo Okapi"
            fill
            sizes="44px"
            className="object-cover object-[48%_28%]"
            priority
          />
        </div>
        <div>
          <p className="font-[family-name:var(--font-syne)] text-xl font-bold leading-none tracking-tight">
            Okapi
          </p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-okapi-ink/40">
            Agent RDC
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          onNewProject?.();
          setMobileOpen(false);
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-okapi-amber px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-okapi-amber-deep"
      >
        <span className="text-base leading-none">+</span>
        Nouvelle conversation
      </button>

      <nav className="mt-5 flex-1 space-y-0.5">
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeNav === item.id}
            onClick={() => go(item.id)}
          />
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-[var(--okapi-stroke)] bg-white/55 p-1.5">
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
            <p className="truncate text-sm font-semibold">Agent Okapi</p>
            <p className="truncate text-[11px] text-okapi-ink/45">Sur demande</p>
          </div>
        </div>
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
    </>
  );

  return (
    <>
      <button
        type="button"
        className="fixed left-4 top-4 z-40 rounded-xl border border-[var(--okapi-stroke)] bg-white/95 px-3 py-2 text-sm font-semibold lg:hidden"
        onClick={() => setMobileOpen(true)}
      >
        Menu
      </button>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-40 bg-okapi-ink/35 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-3 left-3 z-50 flex w-[272px] flex-col rounded-[28px] border border-[var(--okapi-stroke)] bg-[var(--okapi-glass)] p-3.5 backdrop-blur-xl transition-transform lg:static lg:inset-auto lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-[120%]"
        }`}
      >
        {content}
      </aside>
    </>
  );
}
