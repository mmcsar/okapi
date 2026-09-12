/** Moteurs Okapi — noms produit (jamais de vendors côté UI). */

export type OkapiEngine = "flash" | "pro";

export const OKAPI_ENGINE_KEY = "okapi_engine";

export const OKAPI_ENGINES: {
  id: OkapiEngine;
  label: string;
  hint: string;
  badge?: string;
}[] = [
  {
    id: "flash",
    label: "Okapi Flash",
    hint: "Rapide et économique — apps & grands projets du quotidien",
    badge: "Défaut",
  },
  {
    id: "pro",
    label: "Okapi Pro",
    hint: "Raisonnement fort — CRM, plateformes, projets complexes",
  },
];

export function isOkapiEngine(v: unknown): v is OkapiEngine {
  return v === "flash" || v === "pro";
}

export function getStoredEngine(): OkapiEngine {
  if (typeof window === "undefined") return "flash";
  const raw = window.localStorage.getItem(OKAPI_ENGINE_KEY);
  return isOkapiEngine(raw) ? raw : "flash";
}

export function setStoredEngine(engine: OkapiEngine) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OKAPI_ENGINE_KEY, engine);
}

/** Resolve API `engine` body field. */
export function resolveEngine(raw?: string | null): OkapiEngine {
  const v = (raw || "flash").toLowerCase().trim();
  return v === "pro" ? "pro" : "flash";
}
