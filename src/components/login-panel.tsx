"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";

type LoginPanelProps = {
  onBack?: () => void;
  onSuccess?: () => void;
};

export function LoginPanel({ onBack, onSuccess }: LoginPanelProps) {
  const {
    configured,
    signIn,
    signUp,
    signInWithGoogle,
    user,
    displayName,
    signOut,
  } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onGoogle() {
    if (!configured) {
      setStatus("Compte temporairement indisponible. Réessaie plus tard.");
      return;
    }
    setBusy(true);
    setStatus(null);
    const err = await signInWithGoogle();
    setBusy(false);
    if (err) {
      let text = err;
      try {
        const parsed = JSON.parse(err) as { msg?: string; message?: string };
        text = parsed.msg || parsed.message || err;
      } catch {
        /* plain string */
      }
      const soft =
        /provider is not enabled|unsupported provider|validation_failed/i.test(
          text,
        ) || /provider is not enabled|unsupported provider/i.test(err)
          ? "Google n’est pas activé sur Okapi. Dans Supabase → Sign In / Providers → Google : Enable + Client ID + Secret. En attendant, connecte-toi par email."
          : text;
      setStatus(soft);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured) {
      setStatus("Compte temporairement indisponible. Réessaie plus tard.");
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
      const soft = /email logins? are disabled|email provider/i.test(err)
        ? "Connexion email désactivée. Dans Supabase → Sign In / Providers → Email, active Email."
        : /email not confirmed|confirm/i.test(err)
          ? "Compte non confirmé. Dans Supabase → Users, confirme l’utilisateur (ou désactive Confirm email)."
          : /invalid login/i.test(err)
            ? "Email ou mot de passe incorrect."
            : err;
      setStatus(soft);
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
            <p className="mt-1 text-sm text-okapi-ink/50">Connecté à Okapi</p>
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
            Compte Okapi · MMC SARL
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

          <button
            type="button"
            disabled={busy}
            onClick={() => void onGoogle()}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 text-sm font-semibold text-okapi-ink disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuer avec Google
          </button>

          <div className="mb-4 flex items-center gap-3 text-xs text-okapi-ink/35">
            <span className="h-px flex-1 bg-[var(--okapi-stroke)]" />
            ou email
            <span className="h-px flex-1 bg-[var(--okapi-stroke)]" />
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
            Tes projets sont sauvegardés en toute sécurité avec Okapi · MMC SARL.
          </p>
        </form>
      </div>
    </main>
  );
}
