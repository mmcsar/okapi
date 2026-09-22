"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  ID_DOC_OPTIONS,
  type AccountType,
  type IdDocType,
} from "@/lib/kyc";

type KycFormProps = {
  initial?: {
    full_name?: string | null;
    phone?: string | null;
    city?: string | null;
    account_type?: string | null;
    id_doc_type?: string | null;
    id_doc_number?: string | null;
    nif?: string | null;
    rccm?: string | null;
  } | null;
  onDone?: () => void;
};

export function KycForm({ initial, onDone }: KycFormProps) {
  const { authFetch } = useAuth();
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [city, setCity] = useState(initial?.city ?? "Kinshasa");
  const [accountType, setAccountType] = useState<AccountType>(
    initial?.account_type === "business" ? "business" : "personal",
  );
  const [idDocType, setIdDocType] = useState<IdDocType>(
    (initial?.id_doc_type as IdDocType) || "voter",
  );
  const [idDocNumber, setIdDocNumber] = useState(
    initial?.id_doc_number ?? "",
  );
  const [nif, setNif] = useState(initial?.nif ?? "");
  const [rccm, setRccm] = useState(initial?.rccm ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await authFetch("/api/kyc/submit", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          phone,
          city,
          accountType,
          idDocType,
          idDocNumber,
          nif,
          rccm,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setOk(data.message ?? "Identité enregistrée.");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAccountType("personal")}
          className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
            accountType === "personal"
              ? "border-okapi-forest bg-okapi-forest text-white"
              : "border-[var(--okapi-stroke)] bg-white text-okapi-ink/70"
          }`}
        >
          Particulier
        </button>
        <button
          type="button"
          onClick={() => setAccountType("business")}
          className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${
            accountType === "business"
              ? "border-okapi-forest bg-okapi-forest text-white"
              : "border-[var(--okapi-stroke)] bg-white text-okapi-ink/70"
          }`}
        >
          Entreprise
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
            Nom complet *
          </span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
            Téléphone *
          </span>
          <input
            required
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0812 345 678"
            className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
            Ville *
          </span>
          <input
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
            Pièce d’identité *
          </span>
          <select
            value={idDocType}
            onChange={(e) => setIdDocType(e.target.value as IdDocType)}
            className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
          >
            {ID_DOC_OPTIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
            N° de la pièce *
          </span>
          <input
            required
            value={idDocNumber}
            onChange={(e) => setIdDocNumber(e.target.value)}
            className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
          />
        </label>
        {accountType === "business" ? (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                NIF (optionnel)
              </span>
              <input
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                RCCM (optionnel)
              </span>
              <input
                value={rccm}
                onChange={(e) => setRccm(e.target.value)}
                className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
              />
            </label>
          </>
        ) : null}
      </div>

      <p className="text-xs text-okapi-ink/45">
        Particulier : pas besoin de NIF. Identité requise avant le paiement
        mobile.
      </p>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="text-sm font-medium text-okapi-forest">{ok}</p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-okapi-forest px-4 py-3 text-sm font-semibold text-white hover:bg-okapi-leaf disabled:opacity-60"
      >
        {busy ? "Envoi…" : "Enregistrer mon identité"}
      </button>
    </form>
  );
}
