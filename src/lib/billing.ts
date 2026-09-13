/** Plans & helpers — Okapi Mobile Pay (RDC). */

export type OkapiPlanId = "free" | "pro_month" | "pro_year";

export type MobileOperator = "mpesa" | "orange" | "airtel";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

export type SubscriptionStatus =
  | "inactive"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

export type OkapiPlan = {
  id: OkapiPlanId;
  label: string;
  priceCdf: number;
  periodDays: number;
  badge?: string;
  features: string[];
};

export const OKAPI_PLANS: OkapiPlan[] = [
  {
    id: "free",
    label: "Okapi Flash",
    priceCdf: 0,
    periodDays: 0,
    features: [
      "Chat & génération de base",
      "Preview + Studio",
      "Limite quotidienne standard",
    ],
  },
  {
    id: "pro_month",
    label: "Okapi Pro",
    priceCdf: 15_000,
    periodDays: 30,
    badge: "Populaire",
    features: [
      "Okapi Pro (modèles avancés)",
      "Plus de générations / jour",
      "Sauvegarde cloud prioritaire",
      "Support WhatsApp MMC",
    ],
  },
  {
    id: "pro_year",
    label: "Okapi Pro Annuel",
    priceCdf: 150_000,
    periodDays: 365,
    badge: "-17%",
    features: [
      "Tout Pro mensuel",
      "2 mois offerts",
      "Priorité support",
    ],
  },
];

export const MOBILE_OPERATORS: {
  id: MobileOperator;
  label: string;
  hint: string;
}[] = [
  { id: "mpesa", label: "M-Pesa", hint: "Vodacom" },
  { id: "orange", label: "Orange Money", hint: "Orange" },
  { id: "airtel", label: "Airtel Money", hint: "Airtel" },
];

export function getPlan(id: string): OkapiPlan | undefined {
  return OKAPI_PLANS.find((p) => p.id === id);
}

export function formatCdf(amount: number) {
  return `${amount.toLocaleString("fr-FR")} CDF`;
}

/** Normalize DRC mobile numbers to 243… */
export function normalizeDrPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("00243")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 10) n = `243${n.slice(1)}`;
  if (n.length === 9 && /^[89]/.test(n)) n = `243${n}`;
  if (!/^243[89]\d{8}$/.test(n)) return null;
  return n;
}

export function makePaymentReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OKAPI-${stamp}-${rnd}`;
}

export function ussdHint(operator: MobileOperator, phone: string, amount: number) {
  const short = phone.startsWith("243") ? `0${phone.slice(3)}` : phone;
  if (operator === "mpesa") {
    return `Ouvre M-Pesa → Envoie argent / paie marchand · ${formatCdf(amount)} · ${short}`;
  }
  if (operator === "orange") {
    return `Ouvre Orange Money → Paiement · ${formatCdf(amount)} · ${short}`;
  }
  return `Ouvre Airtel Money → Paiement · ${formatCdf(amount)} · ${short}`;
}
