/** Plans & helpers — Okapi Mobile Pay (RDC). */

export type OkapiPlanId = "free" | "pro_month" | "pro_year" | "enterprise_plus";

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
  /** Prix affiché (USD). */
  priceUsd: number;
  /** Montant Mobile Money (CDF), dérivé du taux. */
  priceCdf: number;
  periodDays: number;
  badge?: string;
  features: string[];
};

/** Taux USD → CDF (surchargeable via OKAPI_USD_CDF_RATE). */
export function usdToCdfRate() {
  if (typeof process !== "undefined") {
    const n = Number(process.env.OKAPI_USD_CDF_RATE);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 2_800;
}

export function usdToCdf(usd: number) {
  return Math.round(usd * usdToCdfRate());
}

export const OKAPI_PLANS: OkapiPlan[] = [
  {
    id: "free",
    label: "Okapi Flash",
    priceUsd: 0,
    priceCdf: 0,
    periodDays: 0,
    features: [
      "Chat & génération de base",
      "Preview + Studio",
      "Limite quotidienne standard",
    ],
  },
  {
    id: "enterprise_plus",
    label: "Entreprise Plus",
    priceUsd: 15,
    priceCdf: usdToCdf(15),
    periodDays: 30,
    badge: "15 $",
    features: [
      "Okapi Pro (modèles avancés)",
      "Plus de générations / jour",
      "Sauvegarde cloud prioritaire",
      "Support WhatsApp MMC",
      "Idéal équipes & particuliers pros",
    ],
  },
  {
    // Alias historique — même offre que Entreprise Plus
    id: "pro_month",
    label: "Entreprise Plus",
    priceUsd: 15,
    priceCdf: usdToCdf(15),
    periodDays: 30,
    badge: "15 $",
    features: [
      "Okapi Pro (modèles avancés)",
      "Plus de générations / jour",
      "Sauvegarde cloud prioritaire",
      "Support WhatsApp MMC",
    ],
  },
  {
    id: "pro_year",
    label: "Entreprise Plus Annuel",
    priceUsd: 150,
    priceCdf: usdToCdf(150),
    periodDays: 365,
    badge: "150 $ · -17%",
    features: [
      "Tout Entreprise Plus",
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
  if (id === "pro_month") {
    return OKAPI_PLANS.find((p) => p.id === "enterprise_plus") ?? OKAPI_PLANS.find((p) => p.id === "pro_month");
  }
  return OKAPI_PLANS.find((p) => p.id === id);
}

/** Plans visibles à l’achat (évite le doublon pro_month / enterprise_plus). */
export function getPayablePlans() {
  return OKAPI_PLANS.filter(
    (p) => p.id === "enterprise_plus" || p.id === "pro_year",
  );
}

export function formatCdf(amount: number) {
  return `${amount.toLocaleString("fr-FR")} CDF`;
}

export function formatUsd(amount: number) {
  if (amount <= 0) return "Gratuit";
  return `${amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })}`;
}

export function formatPlanPrice(plan: OkapiPlan) {
  if (plan.priceUsd <= 0) return "Gratuit";
  const period = plan.periodDays >= 360 ? "/ an" : "/ mois";
  return `${formatUsd(plan.priceUsd)} ${period}`;
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
