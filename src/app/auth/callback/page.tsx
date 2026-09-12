"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Connexion Google en cours…");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setMessage("Compte temporairement indisponible.");
      return;
    }

    let cancelled = false;
    const supabase = getSupabase();

    void (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const err =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (err) {
          if (!cancelled) setMessage(err);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (!cancelled) setMessage(error.message);
            return;
          }
        } else {
          // Implicit / hash flow — detectSessionInUrl on the client
          await supabase.auth.getSession();
        }

        if (!cancelled) router.replace("/");
      } catch (e) {
        if (!cancelled) {
          setMessage(
            e instanceof Error ? e.message : "Échec de la connexion Google.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-okapi-mist px-4">
      <p className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/80 px-6 py-4 text-sm text-okapi-ink/70">
        {message}
      </p>
    </main>
  );
}
