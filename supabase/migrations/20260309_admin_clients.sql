-- Admin clients CRM (Okapi)
-- Run in Supabase SQL Editor

create table if not exists public.admin_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  city text not null default 'Kinshasa',
  stage text not null default 'prospect'
    check (stage in ('prospect', 'qualified', 'proposal', 'active')),
  owner text not null default 'Christian',
  value_usd numeric(12, 2) not null default 0,
  next_action text not null default 'Premier contact',
  deadline date not null default (current_date + 7),
  workload_pct integer not null default 20
    check (workload_pct >= 0 and workload_pct <= 100),
  overdue_days integer not null default 0
    check (overdue_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_clients_stage_idx
  on public.admin_clients (stage);

create index if not exists admin_clients_deadline_idx
  on public.admin_clients (deadline);

create or replace function public.set_admin_clients_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_clients_set_updated_at on public.admin_clients;
create trigger admin_clients_set_updated_at
  before update on public.admin_clients
  for each row execute function public.set_admin_clients_updated_at();

-- Locked for anon/authenticated — only service role (admin API) accesses this table
alter table public.admin_clients enable row level security;

drop policy if exists "admin_clients_deny_all" on public.admin_clients;
-- No policies for anon/authenticated = no direct client access

revoke all on table public.admin_clients from anon, authenticated;
grant all on table public.admin_clients to service_role;

-- Seed demo rows if empty
insert into public.admin_clients
  (name, company, city, stage, owner, value_usd, next_action, deadline, workload_pct, overdue_days)
select * from (values
  ('Amina Kalala', 'Café Gombe SARL', 'Kinshasa', 'active', 'Grace', 4200, 'Livrer v2 boutique', date '2026-09-18', 72, 0),
  ('Patrick Mwamba', 'Univ Tech Lubumbashi', 'Lubumbashi', 'proposal', 'David', 8900, 'Envoyer devis formation', date '2026-09-12', 55, 4),
  ('Nadia Okito', 'Boutique Mode Ngaliema', 'Kinshasa', 'qualified', 'Grace', 2100, 'Demo WhatsApp catalog', date '2026-09-15', 40, 1),
  ('Jean Batumike', 'Mining Light Kolwezi', 'Kolwezi', 'prospect', 'Christian', 15000, 'Appel découverte', date '2026-09-20', 25, 0),
  ('Sarah Ilunga', 'Restaurant Lingwala', 'Kinshasa', 'proposal', 'David', 3100, 'Valider menu digital', date '2026-09-10', 48, 10),
  ('Eric Tshibanda', 'Taxi Kin Express', 'Kinshasa', 'qualified', 'Christian', 5600, 'Prototype suivi courses', date '2026-09-22', 33, 0),
  ('Fatou Mbala', 'Clinique Goma Care', 'Goma', 'active', 'Grace', 7800, 'Renouvellement annuel', date '2026-09-25', 60, 0),
  ('Hugo Kabongo', 'AgriConnect Bandundu', 'Bandundu', 'prospect', 'David', 2400, 'Relance WhatsApp', date '2026-09-08', 18, 24)
) as v(name, company, city, stage, owner, value_usd, next_action, deadline, workload_pct, overdue_days)
where not exists (select 1 from public.admin_clients limit 1);
