"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AdminAudienceDashboard } from "@/components/admin-audience-dashboard";
import { AdminClientsDashboard } from "@/components/admin-clients-dashboard";
import { AdminExecutiveDashboard } from "@/components/admin-executive-dashboard";
import { AdminOpsDashboard } from "@/components/admin-ops-dashboard";
import { AdminSystemDashboard } from "@/components/admin-system-dashboard";

type AdminTab = "ops" | "clients" | "executive" | "audience" | "system";
type LoginStep = "password" | "setup" | "totp";

function formatPhone(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+45") && digits.length >= 10) {
    const rest = digits.slice(3);
    return `+45 ${rest.slice(0, 2)} ${rest.slice(2, 4)} ${rest.slice(4, 6)} ${rest.slice(6)}`.trim();
  }
  return phone;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [totp, setTotp] = useState("");
  const [step, setStep] = useState<LoginStep>("password");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>("ops");

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
        body: JSON.stringify(step === "password" ? { code } : { totp }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        step?: "setup" | "totp";
        qrDataUrl?: string;
        manualKey?: string;
        phone?: string;
      };
      if (data.step === "setup" || data.step === "totp") {
        setStep(data.step);
        setPhone(data.phone || "");
        setQrDataUrl(data.qrDataUrl || "");
        setManualKey(data.manualKey || "");
        setTotp("");
        setError(null);
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Accès refusé");
        setAuthed(false);
        return;
      }
      setAuthed(true);
      setCode("");
      setTotp("");
      setStep("password");
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
          <div className="relative mx-auto mb-5 h-14 w-14 overflow-hidden rounded-2xl">
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
            {step === "password"
              ? "Mot de passe, puis code à 6 chiffres de l’application."
              : `Code TOTP pour ${formatPhone(phone || "+4550276685")}.`}
          </p>
          {step === "setup" && qrDataUrl ? (
            <div className="mt-5 text-center">
              {/* Data URL locale : next/image ne gère pas ce QR. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR code TOTP Okapi"
                className="mx-auto h-52 w-52 rounded-2xl bg-white p-2"
              />
              <p className="mt-3 text-xs text-okapi-ink/55">
                Scanne avec Google Authenticator, Aegis ou Authy. Le compte
                s’appelle Okapi {formatPhone(phone || "+4550276685")}.
              </p>
              {manualKey ? (
                <p className="mt-2 break-all font-mono text-[11px] text-okapi-ink/45">
                  {manualKey.replace(/(.{4})/g, "$1 ").trim()}
                </p>
              ) : null}
            </div>
          ) : null}
          {step === "password" ? (
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
          ) : (
            <label className="mt-6 block text-left">
              <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                Code à 6 chiffres
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-okapi-leaf/40"
                placeholder="000000"
              />
            </label>
          )}
          {error ? (
            <p className="mt-3 text-sm text-okapi-amber-deep">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-okapi-forest px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading
              ? "Vérification…"
              : step === "password"
                ? "Continuer"
                : "Valider le code"}
          </button>
          {step !== "password" ? (
            <button
              type="button"
              onClick={() => {
                setStep("password");
                setTotp("");
                setError(null);
              }}
              className="mt-3 w-full text-sm text-okapi-ink/45"
            >
              Revenir au mot de passe
            </button>
          ) : null}
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
      <div className="app-shell mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col overflow-hidden rounded-[28px]">
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
                Okapi Admin
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

        <div className="flex gap-1 border-b border-[var(--okapi-stroke)] px-5 pt-3">
          {(
            [
              { id: "ops" as const, label: "Ops MMC" },
              { id: "clients" as const, label: "Clients" },
              { id: "executive" as const, label: "Exécutif" },
              { id: "audience" as const, label: "Audience" },
              { id: "system" as const, label: "Système" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-white/80 text-okapi-forest"
                  : "text-okapi-ink/45 hover:text-okapi-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-6">
          {tab === "ops" ? (
            <AdminOpsDashboard />
          ) : tab === "clients" ? (
            <AdminClientsDashboard />
          ) : tab === "executive" ? (
            <AdminExecutiveDashboard />
          ) : tab === "audience" ? (
            <AdminAudienceDashboard />
          ) : (
            <AdminSystemDashboard />
          )}

          <p className="mt-6 text-[11px] text-okapi-ink/40">
            Accès protégé par mot de passe, code TOTP et session AES. Invisible
            dans le menu utilisateur.
          </p>
        </div>
      </div>
    </div>
  );
}
