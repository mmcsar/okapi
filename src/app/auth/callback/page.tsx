"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Connexion en cours…");
  const [phase, setPhase] = useState<"working" | "reset" | "done" | "error">(
    "working",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPhase("error");
      setMessage("Compte temporairement indisponible.");
      return;
    }

    let cancelled = false;
    const supabase = getSupabase();
    let recovery = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recovery = true;
    });

    void (async () => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        const next = url.searchParams.get("next");
        const type = url.searchParams.get("type") || hash.get("type");
        const isReset = next === "reset" || type === "recovery";
        const code = url.searchParams.get("code");
        const err =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (err) {
          if (!cancelled) {
            setPhase("error");
            setMessage(err);
          }
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (!cancelled) {
              setPhase("error");
              setMessage(error.message);
            }
            return;
          }
        } else {
          await supabase.auth.getSession();
        }

        if (cancelled) return;
        if (isReset || recovery) {
          setPhase("reset");
          setMessage("");
          return;
        }
        router.replace("/");
      } catch (e) {
        if (!cancelled) {
          setPhase("error");
          setMessage(
            e instanceof Error ? e.message : "Échec de la connexion.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setMessage("6 caractères minimum.");
      return;
    }
    if (password !== confirm) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage("Le nouveau mot de passe n’a pas été enregistré. Réessaie.");
      return;
    }
    setPhase("done");
    setMessage("Mot de passe mis à jour. Tu es connecté.");
  }

  if (phase === "reset" || phase === "done") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-okapi-mist px-4">
        <form
          onSubmit={onSave}
          className="w-full max-w-md rounded-3xl border border-[var(--okapi-stroke)] bg-white/85 p-6"
        >
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
            Nouveau mot de passe
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Choisis un mot de passe pour ton compte Okapi.
          </p>
          {phase === "done" ? (
            <>
              <p className="mt-4 rounded-2xl bg-okapi-mist px-3 py-2 text-sm text-okapi-ink/70">
                {message}
              </p>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="mt-4 w-full rounded-2xl bg-okapi-forest px-4 py-3 text-sm font-semibold text-white"
              >
                Continuer
              </button>
            </>
          ) : (
            <>
              <label className="mt-4 block text-left text-sm">
                <span className="mb-1.5 block text-okapi-ink/50">
                  Nouveau mot de passe
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 pr-12 outline-none focus:border-okapi-leaf/40"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-okapi-ink/45 hover:text-okapi-ink"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </label>
              <label className="mt-3 block text-left text-sm">
                <span className="mb-1.5 block text-okapi-ink/50">Confirmer</span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 outline-none focus:border-okapi-leaf/40"
                  placeholder="••••••••"
                />
              </label>
              {message ? (
                <p className="mt-3 rounded-2xl bg-okapi-mist px-3 py-2 text-sm text-okapi-ink/70">
                  {message}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-2xl bg-okapi-forest px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Patiente…" : "Enregistrer"}
              </button>
            </>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-okapi-mist px-4">
      <p className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/80 px-6 py-4 text-sm text-okapi-ink/70">
        {message}
      </p>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 004.2 4.2" />
      <path d="M9.9 5.1A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a18.4 18.4 0 01-3.2 4.3" />
      <path d="M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7a10.8 10.8 0 004.1-.8" />
    </svg>
  );
}
