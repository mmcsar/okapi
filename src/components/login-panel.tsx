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
    sendPasswordReset,
    user,
    displayName,
    signOut,
  } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [forgot, setForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured) {
      setStatus("Compte temporairement indisponible. Réessaie plus tard.");
      return;
    }
    if (forgot) {
      if (!email.trim()) {
        setStatus("Indique ton email.");
        return;
      }
      setBusy(true);
      setStatus(null);
      const err = await sendPasswordReset(email);
      setBusy(false);
      if (err) {
        setStatus(
          /rate|too many|over_email_send_rate/i.test(err)
            ? "Trop d’essais. Réessaie dans quelques minutes."
            : "Le lien n’a pas pu partir. Réessaie dans un moment.",
        );
        return;
      }
      setStatus(
        "Lien envoyé. Ouvre ta boîte mail et choisis un nouveau mot de passe.",
      );
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
              onClick={() => {
                setMode("signin");
                setForgot(false);
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                mode === "signin" ? "bg-white text-okapi-ink" : "text-okapi-ink/50"
              }`}
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setForgot(false);
              }}
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

          {forgot ? (
            <p className="mb-4 text-left text-sm leading-relaxed text-okapi-ink/60">
              Indique ton email. Okapi t’envoie un lien pour choisir un nouveau mot de passe.
            </p>
          ) : (
            <label className="mb-2 block text-left text-sm">
              <span className="mb-1.5 block text-okapi-ink/50">Mot de passe</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 pr-12 outline-none focus:border-okapi-leaf/40"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={
                    showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-okapi-ink/45 hover:text-okapi-ink"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
          )}

          {!forgot && mode === "signin" ? (
            <button
              type="button"
              onClick={() => {
                setForgot(true);
                setStatus(null);
              }}
              className="mb-4 block text-sm font-semibold text-okapi-forest"
            >
              Mot de passe oublié ?
            </button>
          ) : null}

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
              : forgot
                ? "Envoyer le lien"
                : mode === "signin"
                  ? "Se connecter"
                  : "Créer mon compte"}
          </button>

          {forgot ? (
            <button
              type="button"
              onClick={() => {
                setForgot(false);
                setStatus(null);
              }}
              className="mt-3 w-full text-sm font-semibold text-okapi-ink/55"
            >
              Retour à la connexion
            </button>
          ) : null}

          <p className="mt-4 text-center text-xs text-okapi-ink/40">
            Tes projets sont sauvegardés en toute sécurité avec Okapi · MMC SARL.
          </p>
        </form>
      </div>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 004.2 4.2" />
      <path d="M9.9 5.1A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a18.4 18.4 0 01-3.2 4.3" />
      <path d="M6.1 6.1C3.7 7.8 2 12 2 12s3.5 7 10 7a10.8 10.8 0 004.1-.8" />
    </svg>
  );
}
