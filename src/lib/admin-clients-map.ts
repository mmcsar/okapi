import type { AdminClient, ClientStage } from "@/data/admin-clients";

export type AdminClientRow = {
  id: string;
  name: string;
  company: string;
  city: string;
  stage: ClientStage;
  owner: string;
  value_usd: number | string;
  next_action: string;
  deadline: string;
  workload_pct: number;
  overdue_days: number;
  created_at?: string;
  updated_at?: string;
};

export function rowToClient(row: AdminClientRow): AdminClient {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    city: row.city,
    stage: row.stage,
    owner: row.owner,
    valueUsd: Number(row.value_usd) || 0,
    nextAction: row.next_action,
    deadline:
      typeof row.deadline === "string"
        ? row.deadline.slice(0, 10)
        : String(row.deadline).slice(0, 10),
    workloadPct: row.workload_pct,
    overdueDays: row.overdue_days,
  };
}

export function clientToInsert(c: {
  name: string;
  company: string;
  city: string;
  stage?: ClientStage;
  owner: string;
  valueUsd: number;
  nextAction: string;
  deadline: string;
  workloadPct?: number;
  overdueDays?: number;
}) {
  return {
    name: c.name,
    company: c.company,
    city: c.city,
    stage: c.stage ?? "prospect",
    owner: c.owner,
    value_usd: c.valueUsd,
    next_action: c.nextAction,
    deadline: c.deadline,
    workload_pct: c.workloadPct ?? 20,
    overdue_days: c.overdueDays ?? 0,
  };
}
