-- Passages sur Okapi (accueil, studio, pages publiques).
-- Pas d’adresse IP : une empreinte sert seulement à compter les visiteurs.
-- À lancer une fois dans Supabase → SQL Editor.

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

alter table public.okapi_visits enable row level security;

revoke all on table public.okapi_visits from public, anon, authenticated;
grant select, insert, update, delete on table public.okapi_visits to service_role;
