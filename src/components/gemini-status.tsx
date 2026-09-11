"use client";

import { useState } from "react";

type TestState = "idle" | "loading" | "ok" | "error";

export function GeminiStatus() {
  const [state, setState] = useState<TestState>("idle");
  const [detail, setDetail] = useState("Colle la clé puis clique Tester");

  async function runTest() {
    setState("loading");
    setDetail("Test en cours…");
    try {
      const res = await fetch("/api/gemini/test", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        model?: string;
      };

      if (!res.ok || !data.ok) {
        setState("error");
        setDetail(data.error ?? `Erreur HTTP ${res.status}`);
        return;
      }

      setState("ok");
      setDetail(data.message ?? `Connecté · ${data.model}`);
    } catch (err) {
      setState("error");
      setDetail(err instanceof Error ? err.message : "Erreur réseau");
    }
  }

  const tone =
    state === "ok"
      ? "text-okapi-forest"
      : state === "error"
        ? "text-okapi-amber-deep"
        : "text-okapi-ink/45";

  return (
    <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-4 py-3 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Gemini</p>
          <p className="mt-1 text-xs text-okapi-ink/45">
            Variable : <code className="text-okapi-forest">GEMINI_API_KEY</code>
          </p>
          <p className={`mt-2 text-xs font-medium ${tone}`}>{detail}</p>
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
