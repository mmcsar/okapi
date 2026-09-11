"use client";

import { useState } from "react";

type TestState = "idle" | "loading" | "ok" | "warn" | "error";

export function HeygenStatus() {
  const [state, setState] = useState<TestState>("idle");
  const [detail, setDetail] = useState("Clique Tester pour vérifier");
  const [extra, setExtra] = useState<string | null>(null);

  async function runTest() {
    setState("loading");
    setDetail("Test en cours…");
    setExtra(null);
    try {
      const res = await fetch("/api/heygen/test", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        summary?: {
          name?: string;
          walletBalance?: number;
          planCredits?: number;
          message?: string;
        };
      };

      if (!res.ok || !data.ok) {
        setState("error");
        setDetail(data.error ?? `Erreur HTTP ${res.status}`);
        return;
      }

      const s = data.summary;
      const wallet = s?.walletBalance ?? 0;
      const plan = s?.planCredits;
      const connected = Boolean(s?.name);

      if (!connected) {
        setState("error");
        setDetail("Réponse HeyGen inattendue");
        return;
      }

      if (wallet <= 0 && (plan == null || plan <= 0)) {
        setState("warn");
        setDetail(`Connecté · ${s?.name} · wallet 0`);
        setExtra(
          "La clé marche, mais le solde est à 0 — impossible de générer une vidéo tant que le compte n’a pas de crédits.",
        );
        return;
      }

      setState("ok");
      setDetail(
        plan != null
          ? `Connecté · ${s?.name} · plan ≈ ${plan} · wallet ${wallet}`
          : `Connecté · ${s?.name} · wallet ${wallet}`,
      );
    } catch (err) {
      setState("error");
      setDetail(err instanceof Error ? err.message : "Erreur réseau");
    }
  }

  const tone =
    state === "ok"
      ? "text-okapi-forest"
      : state === "warn"
        ? "text-okapi-amber-deep"
        : state === "error"
          ? "text-okapi-amber-deep"
          : "text-okapi-ink/45";

  return (
    <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-4 py-3 text-left sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">HeyGen</p>
          <p className="mt-1 text-xs text-okapi-ink/45">
            Variable : <code className="text-okapi-forest">HEYGEN_API_KEY</code>
          </p>
          <p className={`mt-2 text-xs font-medium ${tone}`}>{detail}</p>
          {extra ? (
            <p className="mt-1 text-[11px] leading-relaxed text-okapi-ink/45">
              {extra}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={state === "loading"}
          className="shrink-0 rounded-xl bg-okapi-forest px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {state === "loading" ? "…" : "Tester"}
        </button>
      </div>
    </div>
  );
}
