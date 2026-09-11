"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";

type LoginPanelProps = {
  onBack?: () => void;
  onSuccess?: () => void;
};

export function LoginPanel({ onBack, onSuccess }: LoginPanelProps) {
  const { configured, signIn, signUp, user, displayName, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured) {
      setStatus("Supabase non configuré (.env.local).");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setStatus("Email + mot de passe (6 caractères min).");
      return;
    }

    setBusy(true);
    setStatus(null);
    const err =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, name || undefined);
    setBusy(false);

    if (err) {
      setStatus(err);
      return;
    }

    setStatus(
      mode === "signup"
        ? "Compte créé. Si la confirmation email est activée, vérifie ta boîte mail."
        : "Connecté.",
    );
    onSuccess?.();
  }

  if (user) {
    return (
      <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
          <div>
            <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
              Compte
            </h1>
            <p className="mt-1 text-sm text-okapi-ink/50">Session Supabase active</p>
          </div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm"
            >
              Retour
            </button>
          ) : null}
        </header>
        <div className="mx-auto w-full max-w-md px-4 py-10">
          <div className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-6">
            <p className="text-sm text-okapi-ink/55">Connecté en tant que</p>
            <p className="mt-1 font-[family-name:var(--font-syne)] text-xl font-bold">
              {displayName}
            </p>
            <p className="mt-1 text-sm text-okapi-ink/45">{user.email}</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-6 w-full rounded-2xl border border-[var(--okapi-stroke)] px-4 py-3 text-sm font-semibold"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
            Connexion
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Compte Okapi · sauvegarde cloud Supabase
          </p>
        </div>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm"
          >
            Retour
          </button>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-8">
        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-6"
        >
          <div className="mb-4 flex gap-2 rounded-2xl bg-okapi-mist p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                mode === "signin" ? "bg-white text-okapi-ink" : "text-okapi-ink/50"
              }`}
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                mode === "signup" ? "bg-white text-okapi-ink" : "text-okapi-ink/50"
              }`}
            >
              Créer un compte
            </button>
          </div>

          {mode === "signup" ? (
            <label className="mb-3 block text-left text-sm">
              <span className="mb-1.5 block text-okapi-ink/50">Prénom / nom</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 outline-none focus:border-okapi-leaf/40"
                placeholder="Christian"
              />
            </label>
          ) : null}

          <label className="mb-3 block text-left text-sm">
            <span className="mb-1.5 block text-okapi-ink/50">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 outline-none focus:border-okapi-leaf/40"
              placeholder="toi@email.com"
            />
          </label>

          <label className="mb-4 block text-left text-sm">
            <span className="mb-1.5 block text-okapi-ink/50">Mot de passe</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 outline-none focus:border-okapi-leaf/40"
              placeholder="••••••••"
            />
          </label>

          {status ? (
            <p className="mb-3 rounded-2xl bg-okapi-mist px-3 py-2 text-sm text-okapi-ink/70">
              {status}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-okapi-forest px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy
              ? "Patiente…"
              : mode === "signin"
                ? "Se connecter"
                : "Créer mon compte"}
          </button>

          <p className="mt-4 text-center text-xs text-okapi-ink/40">
            Full stack : Auth Supabase → API projets → base RLS.
          </p>
        </form>
      </div>
    </main>
  );
}
