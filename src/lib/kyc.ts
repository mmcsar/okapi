/** KYC léger Okapi — particuliers (sans NIF) + option entreprise. */

export type AccountType = "personal" | "business";

export type IdDocType = "voter" | "passport" | "permit" | "national_id";

export type KycStatus = "none" | "pending" | "verified" | "rejected";

export type KycProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  account_type: AccountType;
  id_doc_type: IdDocType | null;
  id_doc_number: string | null;
  nif: string | null;
  rccm: string | null;
  kyc_status: KycStatus;
  kyc_submitted_at: string | null;
  kyc_verified_at: string | null;
};

export const ID_DOC_OPTIONS: { id: IdDocType; label: string }[] = [
  { id: "voter", label: "Carte d’électeur" },
  { id: "national_id", label: "Carte d’identité" },
  { id: "passport", label: "Passeport" },
  { id: "permit", label: "Permis de conduire" },
];

export function kycIsReady(status?: string | null) {
  return status === "pending" || status === "verified";
}

export function kycStatusLabel(status?: string | null) {
  if (status === "verified") return "Vérifié";
  if (status === "pending") return "En revue MMC";
  if (status === "rejected") return "À corriger";
  return "Non rempli";
}

export type KycSubmitInput = {
  fullName: string;
  phone: string;
  city: string;
  accountType: AccountType;
  idDocType: IdDocType;
  idDocNumber: string;
  nif?: string;
  rccm?: string;
};

export function validateKycInput(input: KycSubmitInput): string | null {
  const name = input.fullName.trim();
  if (name.length < 3) return "Indique ton nom complet.";
  if (!input.phone.trim()) return "Indique ton numéro de téléphone.";
  if (!input.city.trim()) return "Indique ta ville.";
  if (!input.idDocType) return "Choisis un type de pièce d’identité.";
  if (input.idDocNumber.trim().length < 4) {
    return "Indique le numéro de ta pièce d’identité.";
  }
  if (input.accountType === "business") {
    // NIF/RCCM recommandés pour pro, mais pas bloquants au démarrage
  }
  return null;
}
