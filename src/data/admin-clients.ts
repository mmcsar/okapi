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
