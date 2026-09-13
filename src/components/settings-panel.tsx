"use client";

import { useEffect, useState } from "react";
import { PwaInstallButton } from "@/components/pwa-install-button";
import {
  getStoredLanguage,
  OKAPI_LANGUAGES,
  setStoredLanguage,
} from "@/lib/i18n";

type SettingsPanelProps = {
  onBack?: () => void;
  onOpenBilling?: () => void;
};

export function SettingsPanel({ onBack, onOpenBilling }: SettingsPanelProps) {
  const [name, setName] = useState("Christian");
  const [city, setCity] = useState("Kinshasa");
  const [email, setEmail] = useState("christian@okapi.cd");
  const [language, setLanguage] = useState("auto");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLanguage(getStoredLanguage());
  }, []);

  function save() {
    setStoredLanguage(language);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            Paramètres
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Profil, langue et installation de l’app
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/70 px-4 py-2 text-sm font-medium text-okapi-ink/70"
            >
              Retour
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            className="rounded-2xl bg-okapi-amber px-4 py-2 text-sm font-semibold text-white hover:bg-okapi-amber-deep"
          >
            {saved ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 p-5 backdrop-blur-md">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
              Profil
            </h2>
            <p className="mt-1 text-sm text-okapi-ink/45">
              Infos affichées dans Okapi
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-left">
                <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                  Nom
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
                />
              </label>
              <label className="block text-left">
                <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                  Ville
                </span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
                />
              </label>
              <label className="block text-left sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 p-5 backdrop-blur-md">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
              Langue & région
            </h2>
            <p className="mt-1 text-sm text-okapi-ink/45">
              L’agent répond dans la langue du message. Tu peux aussi forcer une
              langue préférée.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-left">
                <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                  Langue IA
                </span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
                >
                  {OKAPI_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-left">
                <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                  Pays
                </span>
                <input
                  value="République Démocratique du Congo"
                  readOnly
                  className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-okapi-mist/80 px-4 py-2.5 text-sm text-okapi-ink/70 outline-none"
                />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 p-5 backdrop-blur-md">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
              Abonnement · Mobile Pay + KYC
            </h2>
            <p className="mt-1 text-sm text-okapi-ink/45">
              KYC obligatoire puis paiement Entreprise Plus (15 $) via Mobile
              Money.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => onOpenBilling?.()}
                className="rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-okapi-leaf"
              >
                KYC & Mobile Pay
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/70 p-5 backdrop-blur-md">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
              Application
            </h2>
            <p className="mt-1 text-sm text-okapi-ink/45">
              Installe Okapi sur ton téléphone, comme une app.
            </p>
            <div className="mt-4">
              <PwaInstallButton />
            </div>
          </section>

          <section className="rounded-3xl border border-okapi-amber/25 bg-okapi-amber/5 p-5">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
              Avertissement
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-okapi-ink/65">
              Okapi (plateforme IA de MMC SARL) peut se tromper. Vérifie toujours
              le code, les textes et les décisions importantes. Okapi n’est ni un
              médecin ni un juriste et ne remplace pas un professionnel de santé
              ou du droit.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
