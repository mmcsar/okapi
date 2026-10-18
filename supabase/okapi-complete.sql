-- =============================================================================
-- OKAPI — SQL complet (MMC SARL)
-- Supabase → SQL Editor → New query → coller CE fichier → Run
-- Idempotent : on peut le relancer. Aucun client fictif.
-- La première ligne doit être ce commentaire, pas "use client".
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Profils
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  city text default 'Kinshasa',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists account_type text not null default 'personal',
  add column if not exists id_doc_type text,
  add column if not exists id_doc_number text,
  add column if not exists nif text,
  add column if not exists rccm text,
  add column if not exists kyc_status text not null default 'none',
  add column if not exists kyc_submitted_at timestamptz,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_notes text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists city text default 'Kinshasa';

alter table public.profiles drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('personal', 'business'));

alter table public.profiles drop constraint if exists profiles_id_doc_type_check;
alter table public.profiles
  add constraint profiles_id_doc_type_check
  check (id_doc_type is null or id_doc_type in ('voter', 'passport', 'permit', 'national_id'));

alter table public.profiles drop constraint if exists profiles_kyc_status_check;
alter table public.profiles
  add constraint profiles_kyc_status_check
  check (kyc_status in ('none', 'pending', 'verified', 'rejected'));

create index if not exists profiles_kyc_status_idx
  on public.profiles (kyc_status);

comment on column public.profiles.kyc_status is
  'none | pending | verified | rejected — requis avant Mobile Pay';

-- -----------------------------------------------------------------------------
-- 2. Projets
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

alter table public.projects
  add column if not exists is_public boolean not null default false,
  add column if not exists share_slug text,
  add column if not exists backend_sql text,
  add column if not exists backend_api text,
  add column if not exists backend_readme text,
  add column if not exists artifacts jsonb not null default '{}'::jsonb;

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

create unique index if not exists projects_share_slug_uidx
  on public.projects (share_slug)
  where share_slug is not null;

comment on column public.projects.artifacts is
  'Bundle Studio: react, reactNative, nextjs, sql, api, python, flutter, readme, images[]';

-- -----------------------------------------------------------------------------
-- 3. Données des apps générées
-- -----------------------------------------------------------------------------
create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  collection text not null check (char_length(collection) between 1 and 64),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_records_project_collection_idx
  on public.app_records (project_id, collection, created_at desc);

create index if not exists app_records_user_idx
  on public.app_records (user_id);

-- -----------------------------------------------------------------------------
-- 4. CRM admin (vide — pas de fiches d'exemple)
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
-- 5. Abonnements et Mobile Money
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null default 'free',
  status text not null default 'inactive'
    check (status in ('inactive', 'pending', 'active', 'past_due', 'cancelled')),
  phone text,
  operator text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.mobile_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id text not null,
  amount_cdf integer not null,
  currency text not null default 'CDF',
  operator text not null
    check (operator in ('mpesa', 'orange', 'airtel')),
  phone text not null,
  reference text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled')),
  provider text not null default 'manual',
  provider_ref text,
  meta jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mobile_payments_user_idx
  on public.mobile_payments (user_id, created_at desc);

create index if not exists mobile_payments_status_idx
  on public.mobile_payments (status);

comment on table public.subscriptions is 'Abonnement Okapi (Flash / Pro)';
comment on table public.mobile_payments is 'Paiements Mobile Money (M-Pesa, Orange, Airtel)';

-- -----------------------------------------------------------------------------
-- 6. Automatisations
-- -----------------------------------------------------------------------------
create table if not exists public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text not null,
  title text not null,
  schedule_key text not null default 'manual',
  enabled boolean not null default true,
  topic text,
  last_run_at timestamptz,
  last_result text,
  run_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, template_id)
);

create index if not exists scheduled_tasks_user_idx
  on public.scheduled_tasks (user_id);

create index if not exists scheduled_tasks_due_idx
  on public.scheduled_tasks (enabled, schedule_key, last_run_at);

-- -----------------------------------------------------------------------------
-- 7. Faits officiels RDC
-- -----------------------------------------------------------------------------
create table if not exists public.official_office_facts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  province text not null,
  role text not null default 'gouverneur',
  holder_name text not null,
  interim boolean not null default false,
  source_url text,
  as_of date not null default current_date,
  match_keywords text[] not null default '{}',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists official_office_facts_active_idx
  on public.official_office_facts (active, province);

insert into public.official_office_facts
  (slug, province, role, holder_name, interim, source_url, as_of, match_keywords, notes)
values
  (
    'gouverneur-haut-katanga',
    'Haut-Katanga',
    'gouverneur intérimaire',
    'Martin Kazembe Shula',
    true,
    'https://haut-katanga.gouv.cd/le-gouverneur/',
    '2026-09-01',
    array['haut-katanga', 'haut katanga', 'lubumbashi'],
    'Snapshot vérifié Okapi — confirmer sur le site provincial.'
  ),
  (
    'gouverneur-lualaba',
    'Lualaba',
    'gouverneure',
    'Fifi Masuka Saini',
    false,
    'https://www.provincelualaba.cd/',
    '2026-09-01',
    array['lualaba', 'kolwezi'],
    'Snapshot vérifié Okapi — confirmer sur le site provincial.'
  )
on conflict (slug) do update set
  province = excluded.province,
  role = excluded.role,
  holder_name = excluded.holder_name,
  interim = excluded.interim,
  source_url = excluded.source_url,
  as_of = excluded.as_of,
  match_keywords = excluded.match_keywords,
  notes = excluded.notes,
  active = true,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 8. Quota journalier (chat / génération)
-- -----------------------------------------------------------------------------
create table if not exists public.okapi_usage_daily (
  quota_key text not null,
  day date not null,
  chat_count integer not null default 0,
  generate_count integer not null default 0,
  primary key (quota_key, day)
);

create or replace function public.okapi_consume_quota(
  p_key text,
  p_kind text,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  today date := (now() at time zone 'utc')::date;
begin
  if p_key is null or length(p_key) < 3 or length(p_key) > 80 then
    return -1;
  end if;
  if p_kind not in ('chat', 'generate') or p_limit is null or p_limit < 1 then
    return -1;
  end if;

  insert into public.okapi_usage_daily (quota_key, day)
  values (p_key, today)
  on conflict (quota_key, day) do nothing;

  if p_kind = 'chat' then
    update public.okapi_usage_daily
      set chat_count = chat_count + 1
      where quota_key = p_key
        and day = today
        and chat_count < p_limit
      returning chat_count into used;
  else
    update public.okapi_usage_daily
      set generate_count = generate_count + 1
      where quota_key = p_key
        and day = today
        and generate_count < p_limit
      returning generate_count into used;
  end if;

  if used is null then
    return -1;
  end if;

  return used;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Passages (Audience)
-- -----------------------------------------------------------------------------
create table if not exists public.okapi_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path text not null,
  visitor_key text not null,
  user_id uuid,
  display_name text,
  city text,
  country text
);

create index if not exists okapi_visits_created_idx
  on public.okapi_visits (created_at desc);

create index if not exists okapi_visits_dedup_idx
  on public.okapi_visits (visitor_key, path, created_at desc);

-- -----------------------------------------------------------------------------
-- 10. Fonctions et triggers
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
exception
  when others then
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
-- 11. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.app_records enable row level security;
alter table public.admin_clients enable row level security;
alter table public.subscriptions enable row level security;
alter table public.mobile_payments enable row level security;
alter table public.scheduled_tasks enable row level security;
alter table public.official_office_facts enable row level security;
alter table public.okapi_usage_daily enable row level security;
alter table public.okapi_visits enable row level security;

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

drop policy if exists "projects_public_read" on public.projects;
create policy "projects_public_read"
  on public.projects for select
  using (is_public = true);

drop policy if exists "app_records_select_own" on public.app_records;
create policy "app_records_select_own"
  on public.app_records for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.projects p
      where p.id = app_records.project_id
        and p.is_public = true
    )
  );

drop policy if exists "app_records_insert_own" on public.app_records;
create policy "app_records_insert_own"
  on public.app_records for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "app_records_update_own" on public.app_records;
create policy "app_records_update_own"
  on public.app_records for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = app_records.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "app_records_delete_own" on public.app_records;
create policy "app_records_delete_own"
  on public.app_records for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = app_records.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "admin_clients_deny_all" on public.admin_clients;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "subscriptions_upsert_own" on public.subscriptions;
create policy "subscriptions_upsert_own"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "subscriptions_update_own" on public.subscriptions;
create policy "subscriptions_update_own"
  on public.subscriptions for update
  using (auth.uid() = user_id);

drop policy if exists "payments_select_own" on public.mobile_payments;
create policy "payments_select_own"
  on public.mobile_payments for select
  using (auth.uid() = user_id);

drop policy if exists "payments_insert_own" on public.mobile_payments;
create policy "payments_insert_own"
  on public.mobile_payments for insert
  with check (auth.uid() = user_id);

drop policy if exists "scheduled_tasks_select_own" on public.scheduled_tasks;
create policy "scheduled_tasks_select_own"
  on public.scheduled_tasks for select
  using (auth.uid() = user_id);

drop policy if exists "scheduled_tasks_insert_own" on public.scheduled_tasks;
create policy "scheduled_tasks_insert_own"
  on public.scheduled_tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "scheduled_tasks_update_own" on public.scheduled_tasks;
create policy "scheduled_tasks_update_own"
  on public.scheduled_tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "scheduled_tasks_delete_own" on public.scheduled_tasks;
create policy "scheduled_tasks_delete_own"
  on public.scheduled_tasks for delete
  using (auth.uid() = user_id);

drop policy if exists "official_office_facts_select_active" on public.official_office_facts;
create policy "official_office_facts_select_active"
  on public.official_office_facts for select
  using (active = true);

-- -----------------------------------------------------------------------------
-- 12. Droits
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select on table public.projects to anon;

grant select, insert, update, delete on table public.app_records to authenticated;
grant select on table public.app_records to anon;

grant select, insert, update on table public.subscriptions to authenticated;
grant select, insert on table public.mobile_payments to authenticated;

grant select, insert, update, delete on table public.scheduled_tasks to authenticated;

grant select on table public.official_office_facts to anon, authenticated;

revoke all on table public.admin_clients from anon, authenticated;
revoke all on table public.okapi_usage_daily from public, anon, authenticated;
revoke all on table public.okapi_visits from public, anon, authenticated;
revoke all on function public.okapi_consume_quota(text, text, integer) from public, anon, authenticated;

grant all on table public.profiles to service_role;
grant all on table public.projects to service_role;
grant all on table public.app_records to service_role;
grant all on table public.admin_clients to service_role;
grant all on table public.subscriptions to service_role;
grant all on table public.mobile_payments to service_role;
grant all on table public.scheduled_tasks to service_role;
grant all on table public.official_office_facts to service_role;
grant all on table public.okapi_usage_daily to service_role;
grant all on table public.okapi_visits to service_role;
grant execute on function public.okapi_consume_quota(text, text, integer) to service_role;

-- =============================================================================
-- Fin. Tables : profiles, projects, app_records, admin_clients, subscriptions,
-- mobile_payments, scheduled_tasks, official_office_facts, okapi_usage_daily,
-- okapi_visits.
-- =============================================================================
