export type ClientStage = "prospect" | "qualified" | "proposal" | "active";

export type AdminClient = {
  id: string;
  name: string;
  company: string;
  city: string;
  stage: ClientStage;
  owner: string;
  valueUsd: number;
  nextAction: string;
  deadline: string; // ISO date
  workloadPct: number;
  overdueDays: number; // 0 = not overdue
};

export const CLIENT_STAGES: {
  id: ClientStage;
  label: string;
  status: "done" | "progress" | "waiting";
}[] = [
  { id: "prospect", label: "Prospect", status: "done" },
  { id: "qualified", label: "Qualifié", status: "done" },
  { id: "proposal", label: "Proposition", status: "progress" },
  { id: "active", label: "Client actif", status: "waiting" },
];

export const SEED_CLIENTS: AdminClient[] = [
  {
    id: "c1",
    name: "Amina Kalala",
    company: "Café Gombe SARL",
    city: "Kinshasa",
    stage: "active",
    owner: "Grace",
    valueUsd: 4200,
    nextAction: "Livrer v2 boutique",
    deadline: "2026-09-18",
    workloadPct: 72,
    overdueDays: 0,
  },
  {
    id: "c2",
    name: "Patrick Mwamba",
    company: "Univ Tech Lubumbashi",
    city: "Lubumbashi",
    stage: "proposal",
    owner: "David",
    valueUsd: 8900,
    nextAction: "Envoyer devis formation",
    deadline: "2026-09-12",
    workloadPct: 55,
    overdueDays: 4,
  },
  {
    id: "c3",
    name: "Nadia Okito",
    company: "Boutique Mode Ngaliema",
    city: "Kinshasa",
    stage: "qualified",
    owner: "Grace",
    valueUsd: 2100,
    nextAction: "Demo WhatsApp catalog",
    deadline: "2026-09-15",
    workloadPct: 40,
    overdueDays: 1,
  },
  {
    id: "c4",
    name: "Jean Batumike",
    company: "Mining Light Kolwezi",
    city: "Kolwezi",
    stage: "prospect",
    owner: "Christian",
    valueUsd: 15000,
    nextAction: "Appel découverte",
    deadline: "2026-09-20",
    workloadPct: 25,
    overdueDays: 0,
  },
  {
    id: "c5",
    name: "Sarah Ilunga",
    company: "Restaurant Lingwala",
    city: "Kinshasa",
    stage: "proposal",
    owner: "David",
    valueUsd: 3100,
    nextAction: "Valider menu digital",
    deadline: "2026-09-10",
    workloadPct: 48,
    overdueDays: 10,
  },
  {
    id: "c6",
    name: "Eric Tshibanda",
    company: "Taxi Kin Express",
    city: "Kinshasa",
    stage: "qualified",
    owner: "Christian",
    valueUsd: 5600,
    nextAction: "Prototype suivi courses",
    deadline: "2026-09-22",
    workloadPct: 33,
    overdueDays: 0,
  },
  {
    id: "c7",
    name: "Fatou Mbala",
    company: "Clinique Goma Care",
    city: "Goma",
    stage: "active",
    owner: "Grace",
    valueUsd: 7800,
    nextAction: "Renouvellement annuel",
    deadline: "2026-09-25",
    workloadPct: 60,
    overdueDays: 0,
  },
  {
    id: "c8",
    name: "Hugo Kabongo",
    company: "AgriConnect Bandundu",
    city: "Bandundu",
    stage: "prospect",
    owner: "David",
    valueUsd: 2400,
    nextAction: "Relance WhatsApp",
    deadline: "2026-09-08",
    workloadPct: 18,
    overdueDays: 24,
  },
];

export const TEAM_LOAD = [
  { name: "Grace", pct: 67 },
  { name: "David", pct: 55 },
  { name: "Christian", pct: 48 },
  { name: "Amina", pct: 45 },
  { name: "Patrick", pct: 30 },
] as const;

export function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatFrDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
