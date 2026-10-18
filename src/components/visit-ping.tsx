"use client";

import { useEffect } from "react";

/** Signale un passage. Même page : une fois par 30 minutes dans cet onglet. */
export function VisitPing({
  path,
  token,
}: {
  path: string;
  token?: string | null;
}) {
  useEffect(() => {
    if (!path) return;
    const storageKey = `okapi-visit:${path}:${token ? "u" : "g"}`;
    try {
      const prev = window.sessionStorage.getItem(storageKey);
      if (prev && Date.now() - Number(prev) < 30 * 60_000) return;
      window.sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // sessionStorage indisponible : on envoie quand même
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    void fetch("/api/visits", {
      method: "POST",
      headers,
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => undefined);
  }, [path, token]);

  return null;
}
