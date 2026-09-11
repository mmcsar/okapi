"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SupabaseStatus } from "@/components/supabase-status";

const stats = [
  { label: "Utilisateurs", value: "248", hint: "+18 cette semaine" },
  { label: "Projets générés", value: "1 024", hint: "87 aujourd’hui" },
  { label: "Agents actifs", value: "4", hint: "sur 6 templates" },
  { label: "Erreurs API", value: "3", hint: "24 h" },
] as const;

const users = [
  { name: "Amina K.", city: "Kinshasa", plan: "Pro", projects: 6 },
  { name: "Patrick M.", city: "Lubumbashi", plan: "Gratuit", projects: 2 },
  { name: "Grace L.", city: "Goma", plan: "Pro", projects: 11 },
  { name: "David T.", city: "Kinshasa", plan: "Business", projects: 19 },
] as const;

const systemRows = [
  { name: "App publique /", status: "OK" },
  { name: "Supabase", status: "OK" },
  { name: "LLM", status: "Non branché" },
  { name: "HeyGen", status: "Optionnel" },
] as const;

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/session");
      const data = (await res.json()) as { ok?: boolean };
      setAuthed(Boolean(data.ok));
    })();
  }, []);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Accès refusé");
        setAuthed(false);
        return;
      }
      setAuthed(true);
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-okapi-ink/50">
        Vérification accès admin…
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={onLogin}
          className="w-full max-w-md rounded-[28px] border border-[var(--okapi-stroke)] bg-white/80 p-8 backdrop-blur-xl"
        >
          <div className="mx-auto relative mb-5 h-14 w-14 overflow-hidden rounded-2xl">
            <Image
              src="/okapi-logo.png"
              alt="Okapi"
              fill
              sizes="56px"
              className="object-cover object-[48%_26%]"
              priority
            />
          </div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
            Admin Okapi
          </h1>
          <p className="mt-2 text-sm text-okapi-ink/55">
            Zone privée — les utilisateurs de l’app n’y ont pas accès.
          </p>
          <label className="mt-6 block text-left">
            <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
              Code admin
            </span>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 text-sm outline-none focus:border-okapi-leaf/40"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="mt-3 text-sm text-okapi-amber-deep">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-okapi-forest px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Vérification…" : "Entrer"}
          </button>
          <Link
            href="/"
            className="mt-4 block text-center text-sm text-okapi-ink/45 hover:text-okapi-forest"
          >
            ← Retour app utilisateur
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen p-3 lg:p-5">
      <div className="app-shell mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col overflow-hidden rounded-[28px]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--okapi-stroke)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl">
              <Image
                src="/okapi-logo.png"
                alt=""
                fill
                sizes="40px"
                className="object-cover object-[48%_26%]"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-amber-deep">
                Privé · Admin
              </p>
              <h1 className="font-[family-name:var(--font-syne)] text-xl font-bold">
                Tableau de bord Okapi
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm font-medium"
            >
              App users
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-2xl bg-okapi-ink px-4 py-2 text-sm font-semibold text-white"
            >
              Quitter admin
            </button>
          </div>
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-6">
          <p className="mb-5 text-sm text-okapi-ink/55">
            Vue interne équipe Okapi — non visible dans le menu utilisateur.
          </p>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-okapi-ink/40">
                  {stat.label}
                </p>
                <p className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-bold">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-okapi-ink/45">{stat.hint}</p>
              </article>
            ))}
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                Utilisateurs récents
              </h2>
              <ul className="mt-4 space-y-2">
                {users.map((user) => (
                  <li
                    key={user.name}
                    className="flex items-center justify-between rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{user.name}</p>
                      <p className="text-xs text-okapi-ink/45">
                        {user.city} · {user.projects} projets
                      </p>
                    </div>
                    <span className="rounded-full bg-okapi-forest/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-okapi-forest">
                      {user.plan}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-5">
              <SupabaseStatus />
              <div className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
                <h2 className="font-[family-name:var(--font-syne)] text-lg font-bold">
                  Système
                </h2>
                <ul className="mt-3 space-y-2">
                  {systemRows.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-okapi-ink/65">{row.name}</span>
                      <span
                        className={
                          row.status === "OK"
                            ? "font-medium text-okapi-forest"
                            : "font-medium text-okapi-amber-deep"
                        }
                      >
                        {row.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <p className="mt-6 text-[11px] text-okapi-ink/40">
            Accès protégé par code serveur (`OKAPI_ADMIN_CODE`). Les users de
            l’app publique ne voient pas ce menu.
          </p>
        </div>
      </div>
    </div>
  );
}
