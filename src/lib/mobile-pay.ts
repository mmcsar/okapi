import {
  formatCdf,
  makePaymentReference,
  normalizeDrPhone,
  ussdHint,
  type MobileOperator,
  type OkapiPlanId,
} from "@/lib/billing";

export type CheckoutInput = {
  planId: OkapiPlanId;
  operator: MobileOperator;
  phone: string;
  amountCdf: number;
  userId: string;
};

export type CheckoutResult = {
  reference: string;
  provider: string;
  status: "pending" | "processing";
  message: string;
  ussdHint: string;
  providerRef?: string;
};

/**
 * Mobile Pay provider.
 * - manual (défaut) : crée une demande, confirmation admin / webhook plus tard
 * - demo : même flux + message clair pour tests
 *
 * Plus tard : brancher FlexPay / Flutterwave via MOBILE_PAY_PROVIDER + clés.
 */
export async function startMobileCheckout(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const phone = normalizeDrPhone(input.phone);
  if (!phone) {
    throw new Error(
      "Numéro invalide. Exemple : 0812 345 678 ou +243 812 345 678",
    );
  }
  if (input.planId === "free" || input.amountCdf <= 0) {
    throw new Error("Ce plan ne nécessite pas de paiement.");
  }

  const reference = makePaymentReference();
  const provider =
    process.env.MOBILE_PAY_PROVIDER?.trim().toLowerCase() || "manual";

  // Hook futur : appels API FlexPay / Flutterwave ici
  if (provider === "flexpay" || provider === "flutterwave") {
    // Pas encore de clés → fallback manuel sûr
  }

  return {
    reference,
    provider: provider === "demo" ? "demo" : "manual",
    status: "pending",
    message: `Demande créée. Paie ${formatCdf(input.amountCdf)} via ${operatorLabel(input.operator)} puis confirme sur ton téléphone.`,
    ussdHint: ussdHint(input.operator, phone, input.amountCdf),
    providerRef: undefined,
  };
}

function operatorLabel(op: MobileOperator) {
  if (op === "mpesa") return "M-Pesa";
  if (op === "orange") return "Orange Money";
  return "Airtel Money";
}

export function billingWhatsappUrl(reference: string) {
  const raw =
    process.env.OKAPI_BILLING_WHATSAPP?.trim() ||
    process.env.NEXT_PUBLIC_OKAPI_BILLING_WHATSAPP?.trim() ||
    "243810000000";
  const phone = raw.replace(/\D/g, "");
  const text = encodeURIComponent(
    `Bonjour MMC, je viens de payer Okapi. Référence : ${reference}`,
  );
  return `https://wa.me/${phone}?text=${text}`;
}
