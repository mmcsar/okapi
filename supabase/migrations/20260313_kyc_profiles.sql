-- Okapi KYC léger (particuliers + option pro)
-- Exécuter dans Supabase SQL Editor

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists account_type text not null default 'personal'
    check (account_type in ('personal', 'business')),
  add column if not exists id_doc_type text
    check (id_doc_type is null or id_doc_type in ('voter', 'passport', 'permit', 'national_id')),
  add column if not exists id_doc_number text,
  add column if not exists nif text,
  add column if not exists rccm text,
  add column if not exists kyc_status text not null default 'none'
    check (kyc_status in ('none', 'pending', 'verified', 'rejected')),
  add column if not exists kyc_submitted_at timestamptz,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_notes text,
  add column if not exists updated_at timestamptz not null default now();

-- city already exists on some installs
alter table public.profiles
  add column if not exists city text default 'Kinshasa';

create index if not exists profiles_kyc_status_idx
  on public.profiles (kyc_status);

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

comment on column public.profiles.kyc_status is
  'none | pending | verified | rejected — requis avant Mobile Pay';
