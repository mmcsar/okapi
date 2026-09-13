"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  formatCdf,
  MOBILE_OPERATORS,
  OKAPI_PLANS,
  type MobileOperator,
  type OkapiPlanId,
} from "@/lib/billing";

type BillingPanelProps = {
  onBack?: () => void;
  onNeedLogin?: () => void;
};

type PaymentRow = {
  id: string;
  reference: string;
  status: string;
  amount_cdf: number;
  operator: string;
  phone: string;
  plan_id: string;
  created_at: string;
  paid_at?: string | null;
};

export function BillingPanel({ onBack, onNeedLogin }: BillingPanelProps) {
  const { user, authFetch, ready } = useAuth();
  const [planId, setPlanId] = useState<OkapiPlanId>("pro_month");
  const [operator, setOperator] = useState<MobileOperator>("mpesa");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [ussdHint, setUssdHint] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [subLabel, setSubLabel] = useState("Flash (gratuit)");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/billing/me");
      const data = (await res.json()) as {
        error?: string;
        setupRequired?: boolean;
        plan?: { label?: string };
        subscription?: { active?: boolean; status?: string; plan_id?: string };
        payments?: PaymentRow[];
      };
      if (!res.ok && !data.setupRequired) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      if (data.setupRequired) {
        setStatusLine(
          "Mobile Pay bientôt actif — exécute la migration SQL dans Supabase.",
        );
      } else if (data.subscription?.active) {
        setSubLabel(`${data.plan?.label ?? "Pro"} · actif`);
      } else if (data.subscription?.status === "pending") {
        setSubLabel("Paiement en attente de confirmation");
      } else {
        setSubLabel(data.plan?.label ?? "Flash (gratuit)");
      }
      setPayments(data.payments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [authFetch, user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setPayments([]);
      return;
    }
    void load();
  }, [ready, user, load]);

  async function pay() {
    if (!user) {
      onNeedLogin?.();
      return;
    }
    setBusy(true);
    setError(null);
    setStatusLine(null);
    setUssdHint(null);
    setWhatsappUrl(null);
    try {
      const res = await authFetch("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId, operator, phone }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        ussdHint?: string;
        whatsappUrl?: string;
        payment?: { reference?: string };
      };
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setStatusLine(data.message ?? "Demande envoyée.");
      setUssdHint(data.ussdHint ?? null);
      setWhatsappUrl(data.whatsappUrl ?? null);
      setLastRef(data.payment?.reference ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement impossible");
    } finally {
      setBusy(false);
    }
  }

  const paidPlans = OKAPI_PLANS.filter((p) => p.id !== "free");

  return (
    <main className="app-shell ml-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:ml-3">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--okapi-stroke)] px-4 py-4 lg:px-8">
        <div>
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
            Abonnement
          </h1>
          <p className="mt-1 text-sm text-okapi-ink/50">
            Mobile Pay · M-Pesa · Orange Money · Airtel Money
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

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-okapi-ink/40">
              Ton plan
            </p>
            <p className="mt-1 font-[family-name:var(--font-syne)] text-xl font-bold">
              {loading ? "…" : subLabel}
            </p>
            <p className="mt-2 text-sm text-okapi-ink/50">
              Particuliers : pas de NIF. Paiement Mobile Money sur ton numéro.
            </p>
          </section>

          {!user ? (
            <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-6 text-center">
              <p className="text-sm text-okapi-ink/60">
                Connecte-toi pour activer un abonnement Mobile Pay.
              </p>
              <button
                type="button"
                onClick={() => onNeedLogin?.()}
                className="mt-4 rounded-2xl bg-okapi-forest px-4 py-2.5 text-sm font-semibold text-white"
              >
                Se connecter
              </button>
            </section>
          ) : (
            <>
              <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
                <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
                  Choisir un plan
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {paidPlans.map((plan) => {
                    const active = planId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setPlanId(plan.id)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? "border-okapi-forest bg-okapi-forest/10"
                            : "border-[var(--okapi-stroke)] hover:bg-okapi-mist/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{plan.label}</span>
                          {plan.badge ? (
                            <span className="rounded-full bg-okapi-amber/15 px-2 py-0.5 text-[10px] font-bold text-okapi-amber-deep">
                              {plan.badge}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-lg font-bold text-okapi-forest">
                          {formatCdf(plan.priceCdf)}
                        </p>
                        <ul className="mt-3 space-y-1 text-xs text-okapi-ink/55">
                          {plan.features.slice(0, 3).map((f) => (
                            <li key={f}>· {f}</li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
                <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
                  Mobile Pay
                </h2>
                <p className="mt-1 text-sm text-okapi-ink/45">
                  Choisis l’opérateur et ton numéro Mobile Money.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {MOBILE_OPERATORS.map((op) => {
                    const active = operator === op.id;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => setOperator(op.id)}
                        className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? "border-okapi-forest bg-okapi-forest text-white"
                            : "border-[var(--okapi-stroke)] bg-white text-okapi-ink/70"
                        }`}
                      >
                        {op.label}
                        <span className="ml-1 opacity-70">({op.hint})</span>
                      </button>
                    );
                  })}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs font-medium text-okapi-ink/50">
                    Numéro Mobile Money
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812 345 678"
                    inputMode="tel"
                    className="w-full rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-okapi-leaf/40"
                  />
                </label>

                <button
                  type="button"
                  disabled={busy || !phone.trim()}
                  onClick={() => void pay()}
                  className="mt-4 w-full rounded-2xl bg-okapi-amber px-4 py-3 text-sm font-semibold text-white hover:bg-okapi-amber-deep disabled:opacity-60"
                >
                  {busy ? "Envoi…" : "Payer avec Mobile Pay"}
                </button>

                {error ? (
                  <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </p>
                ) : null}
                {statusLine ? (
                  <p className="mt-3 text-sm text-okapi-forest">{statusLine}</p>
                ) : null}
                {lastRef ? (
                  <p className="mt-1 text-xs font-medium text-okapi-ink/45">
                    Référence : {lastRef}
                  </p>
                ) : null}
                {ussdHint ? (
                  <p className="mt-2 rounded-2xl bg-okapi-mist/80 px-3 py-2 text-sm text-okapi-ink/70">
                    {ussdHint}
                  </p>
                ) : null}
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-2xl border border-okapi-forest/30 bg-okapi-forest/10 px-4 py-2 text-sm font-semibold text-okapi-forest"
                  >
                    Envoyer la preuve sur WhatsApp MMC
                  </a>
                ) : null}
              </section>

              {payments.length > 0 ? (
                <section className="rounded-3xl border border-[var(--okapi-stroke)] bg-white/75 p-5">
                  <h2 className="font-[family-name:var(--font-syne)] text-base font-bold">
                    Historique
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--okapi-stroke)] px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.reference}</p>
                          <p className="text-xs text-okapi-ink/45">
                            {p.operator} · {formatCdf(p.amount_cdf)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            p.status === "paid"
                              ? "bg-okapi-forest/15 text-okapi-forest"
                              : p.status === "pending"
                                ? "bg-okapi-amber/15 text-okapi-amber-deep"
                                : "bg-okapi-mist text-okapi-ink/50"
                          }`}
                        >
                          {p.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
