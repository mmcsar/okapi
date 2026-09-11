-- =============================================================================
-- OKAPI — schéma SQL complet (MMC SARL / Coach)
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent : safe à relancer
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Profils utilisateurs
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  city text default 'Kinshasa',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Projets Okapi (apps générées)
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Projet Okapi',
  sector text not null default 'Site web',
  html text not null default '',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partage public
alter table public.projects
  add column if not exists is_public boolean not null default false;

alter table public.projects
  add column if not exists share_slug text;

-- Artifacts fullstack (SQL / API / README générés)
alter table public.projects
  add column if not exists backend_sql text;

alter table public.projects
  add column if not exists backend_api text;

alter table public.projects
  add column if not exists backend_readme text;

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

create unique index if not exists projects_share_slug_uidx
  on public.projects (share_slug)
  where share_slug is not null;

-- -----------------------------------------------------------------------------
-- 3. CRM Admin clients
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_projects_updated_at();

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

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.admin_clients enable row level security;

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Projects (owner)
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update
  using (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Projects (lecture publique via slug)
drop policy if exists "projects_public_read" on public.projects;
create policy "projects_public_read"
  on public.projects for select
  using (is_public = true);

-- Admin clients : pas d’accès anon/authenticated (service_role seulement)
drop policy if exists "admin_clients_deny_all" on public.admin_clients;

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;

grant select, insert, update, delete on table public.projects to authenticated;
grant select on table public.projects to anon;

revoke all on table public.admin_clients from anon, authenticated;
grant all on table public.admin_clients to service_role;

-- -----------------------------------------------------------------------------
-- 7. Seed CRM (si table vide)
-- -----------------------------------------------------------------------------
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

-- =============================================================================
-- Fin. Vérifie : Table Editor → profiles, projects, admin_clients
-- Auth : active Email dans Authentication → Providers
-- Env app : NEXT_PUBLIC_SUPABASE_URL + ANON KEY + SUPABASE_SERVICE_ROLE_KEY (admin)
-- =============================================================================
