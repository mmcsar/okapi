"use client";

import { useCallback, useEffect, useState } from "react";

type IdentityRow = {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  accountType: string;
  idDocType: string;
  idDocNumber: string | null;
  nif: string | null;
  rccm: string | null;
  status: string;
  statusLabel: string;
  submittedAt: string | null;
  notes: string | null;
};

type PaymentRow = {
  id: string;
  userId: string;
  planLabel: string;
  amountLabel: string;
  operator: string;
  phone: string;
  reference: string;
  status: string;
  createdAt: string;
};

type SubRow = {
  id: string;
  userId: string;
  planLabel: string;
  status: string;
  phone: string | null;
  periodEnd: string | null;
  updatedAt: string;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AdminOpsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [counts, setCounts] = useState({
    identityPending: 0,
    paymentsPending: 0,
    subscriptionsActive: 0,
  });
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ops");
      const data = (await res.json()) as {
        error?: string;
        setupRequired?: boolean;
        counts?: typeof counts;
        identities?: IdentityRow[];
        payments?: PaymentRow[];
        subscriptions?: SubRow[];
      };
      if (data.setupRequired) {
        setSetupRequired(true);
        setError(data.error ?? "Migrations identité / paiement manquantes.");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setSetupRequired(false);
      setCounts(
        data.counts ?? {
          identityPending: 0,
          paymentsPending: 0,
          subscriptionsActive: 0,
        },
      );
      setIdentities(data.identities ?? []);
      setPayments(data.payments ?? []);
      setSubscriptions(data.subscriptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setIdentity(
    userId: string,
    action: "verified" | "rejected",
  ) {
    setBusyId(userId);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/ops/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setFlash(data.message ?? "OK");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  async function setPayment(reference: string, status: "paid" | "failed") {
    setBusyId(reference);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/ops/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, status }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setFlash(data.message ?? "OK");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  const pendingIds = identities.filter((i) => i.status === "pending");
  const pendingPays = payments.filter((p) => p.status === "pending");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-okapi-amber-deep">
          Ops MMC
        </p>
        <h2 className="font-[family-name:var(--font-syne)] text-2xl font-bold">
          Identité · Paiements · Abonnements
        </h2>
        <p className="mt-1 text-sm text-okapi-ink/55">
          Valide les comptes et confirme les Mobile Money reçus (WhatsApp /
          USSD).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Identités à valider",
            value: counts.identityPending,
          },
          {
            label: "Paiements en attente",
            value: counts.paymentsPending,
          },
          {
            label: "Abonnements actifs",
            value: counts.subscriptionsActive,
          },
        ].map((c) => (
          <article
            key={c.label}
            className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5"
          >
            <p className="text-xs uppercase tracking-[0.12em] text-okapi-ink/40">
              {c.label}
            </p>
            <p className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-bold">
              {loading ? "…" : c.value}
            </p>
          </article>
        ))}
      </div>

      {flash ? (
        <p className="rounded-2xl border border-okapi-forest/25 bg-okapi-forest/10 px-4 py-2 text-sm text-okapi-forest">
          {flash}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
          {setupRequired ? (
            <span className="mt-1 block text-xs opacity-80">
              Fichiers : 20260313_kyc_profiles.sql · 20260313_mobile_pay.sql
            </span>
          ) : null}
        </p>
      ) : null}

      <section className="rounded-[28px] border border-okapi-amber/25 bg-okapi-amber/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
            File identité ({pendingIds.length})
          </h3>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-[var(--okapi-stroke)] bg-white/80 px-3 py-1.5 text-xs font-semibold"
          >
            Rafraîchir
          </button>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-okapi-ink/45">Chargement…</p>
        ) : pendingIds.length === 0 ? (
          <p className="mt-3 text-sm text-okapi-ink/45">
            Aucune identité en attente.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pendingIds.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{row.fullName}</p>
                    <p className="text-xs text-okapi-ink/50">
                      {row.phone} · {row.city} · {row.accountType}
                    </p>
                    <p className="mt-1 text-xs text-okapi-ink/55">
                      {row.idDocType}
                      {row.idDocNumber ? ` · ${row.idDocNumber}` : ""}
                    </p>
                    {row.nif || row.rccm ? (
                      <p className="mt-0.5 text-xs text-okapi-ink/45">
                        {row.nif ? `NIF ${row.nif}` : ""}
                        {row.nif && row.rccm ? " · " : ""}
                        {row.rccm ? `RCCM ${row.rccm}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-okapi-ink/40">
                      Envoyé {fmtDate(row.submittedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void setIdentity(row.id, "verified")}
                      className="rounded-xl bg-okapi-forest px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void setIdentity(row.id, "rejected")}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-50"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
        <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
          Paiements Mobile Money ({pendingPays.length} en attente)
        </h3>
        {loading ? (
          <p className="mt-3 text-sm text-okapi-ink/45">Chargement…</p>
        ) : payments.length === 0 ? (
          <p className="mt-3 text-sm text-okapi-ink/45">Aucun paiement.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--okapi-stroke)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.reference}</p>
                  <p className="text-xs text-okapi-ink/50">
                    {p.planLabel} · {p.amountLabel} · {p.operator} · {p.phone}
                  </p>
                  <p className="text-[11px] text-okapi-ink/40">
                    {fmtDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      p.status === "paid"
                        ? "bg-okapi-forest/15 text-okapi-forest"
                        : p.status === "pending"
                          ? "bg-okapi-amber/15 text-okapi-amber-deep"
                          : "bg-okapi-mist text-okapi-ink/50"
                    }`}
                  >
                    {p.status === "paid"
                      ? "Payé"
                      : p.status === "pending"
                        ? "En attente"
                        : p.status === "failed"
                          ? "Échoué"
                          : p.status}
                  </span>
                  {p.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === p.reference}
                        onClick={() => void setPayment(p.reference, "paid")}
                        className="rounded-xl bg-okapi-amber px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.reference}
                        onClick={() => void setPayment(p.reference, "failed")}
                        className="rounded-xl border border-[var(--okapi-stroke)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Échec
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] border border-[var(--okapi-stroke)] bg-white/75 p-5">
        <h3 className="font-[family-name:var(--font-syne)] text-lg font-bold">
          Abonnements
        </h3>
        {loading ? (
          <p className="mt-3 text-sm text-okapi-ink/45">Chargement…</p>
        ) : subscriptions.length === 0 ? (
          <p className="mt-3 text-sm text-okapi-ink/45">Aucun abonnement.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {subscriptions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--okapi-stroke)] px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{s.planLabel}</p>
                  <p className="text-xs text-okapi-ink/45">
                    {s.phone || s.userId.slice(0, 8) + "…"}
                    {s.periodEnd
                      ? ` · jusqu’au ${fmtDate(s.periodEnd)}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                    s.status === "active"
                      ? "bg-okapi-forest/10 text-okapi-forest"
                      : "bg-okapi-mist text-okapi-ink/50"
                  }`}
                >
                  {s.status === "active"
                    ? "Actif"
                    : s.status === "pending"
                      ? "En attente"
                      : s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
