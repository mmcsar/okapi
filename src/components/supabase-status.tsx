"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type Status = "checking" | "ok" | "error" | "missing";

export function SupabaseStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("Vérification…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setStatus("missing");
          setDetail("Variables .env.local manquantes");
        }
        return;
      }

      try {
        const supabase = getSupabase();
        const { error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setStatus("error");
          setDetail(error.message);
          return;
        }
        setStatus("ok");
        setDetail("Connecté · projet Okapi");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setDetail(err instanceof Error ? err.message : "Erreur Supabase");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const tone =
    status === "ok"
      ? "text-okapi-forest"
      : status === "checking"
        ? "text-okapi-ink/45"
        : "text-okapi-amber-deep";

  return (
    <div className="rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/60 px-4 py-3 text-left">
      <p className="text-sm font-semibold">Supabase</p>
      <p className="mt-1 text-xs text-okapi-ink/45">
        Auth, projets et données Okapi
      </p>
      <p className={`mt-2 text-xs font-medium ${tone}`}>{detail}</p>
    </div>
  );
}
