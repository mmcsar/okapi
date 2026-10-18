-- Second facteur admin Okapi (TOTP). Une seule ligne.
-- Supabase → SQL Editor → coller → Run.

create table if not exists public.okapi_admin_mfa (
  id integer primary key default 1,
  phone text not null,
  secret_enc text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint okapi_admin_mfa_singleton check (id = 1)
);

alter table public.okapi_admin_mfa enable row level security;

revoke all on table public.okapi_admin_mfa from public, anon, authenticated;
grant all on table public.okapi_admin_mfa to service_role;
