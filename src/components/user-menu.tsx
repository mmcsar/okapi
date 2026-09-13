"use client";

import { useEffect, useRef, useState } from "react";

type UserMenuProps = {
  onNavigate: (id: string) => void;
  loggedIn: boolean;
  onAuthToggle: () => void;
  userLabel?: string;
};

export function UserMenu({
  onNavigate,
  loggedIn,
  onAuthToggle,
  userLabel,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = userLabel || (loggedIn ? "Compte" : "Invité");
  const initial = name.slice(0, 1).toUpperCase();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-[var(--okapi-stroke)] bg-white/75 py-1 pl-1 pr-3"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-okapi-forest text-xs font-bold text-white">
          {loggedIn ? initial : "?"}
        </div>
        <div className="hidden leading-tight sm:block text-left">
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-okapi-ink/40">
            {loggedIn ? "Connecté" : "Non connecté"}
          </p>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-[var(--okapi-stroke)] bg-white/95 py-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              onNavigate("studio");
              setOpen(false);
            }}
            className="flex w-full px-4 py-2.5 text-left text-sm text-okapi-ink/75 transition hover:bg-okapi-mist"
          >
            Studio
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate("projects");
              setOpen(false);
            }}
            className="flex w-full px-4 py-2.5 text-left text-sm text-okapi-ink/75 transition hover:bg-okapi-mist"
          >
            Projets
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate("billing");
              setOpen(false);
            }}
            className="flex w-full px-4 py-2.5 text-left text-sm text-okapi-ink/75 transition hover:bg-okapi-mist"
          >
            Abonnement
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate("settings");
              setOpen(false);
            }}
            className="flex w-full px-4 py-2.5 text-left text-sm text-okapi-ink/75 transition hover:bg-okapi-mist"
          >
            Paramètres
          </button>
          <div className="my-2 border-t border-[var(--okapi-stroke)]" />
          <button
            type="button"
            onClick={() => {
              onAuthToggle();
              setOpen(false);
            }}
            className="flex w-full px-4 py-2.5 text-left text-sm font-medium text-okapi-forest transition hover:bg-okapi-mist"
          >
            {loggedIn ? "Se déconnecter" : "Se connecter"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
