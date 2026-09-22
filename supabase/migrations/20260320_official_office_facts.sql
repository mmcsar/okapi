-- Faits officiels RDC (gouverneurs…) — source partagée Coach MCP / Agent Okapi.
-- Mettre à jour ici (ou via MCP Supabase) plutôt que de laisser le LLM inventer.

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

alter table public.official_office_facts enable row level security;

-- Lecture publique (faits non secrets) — écriture = service_role / SQL Editor / MCP
drop policy if exists "official_office_facts_select_active" on public.official_office_facts;
create policy "official_office_facts_select_active"
  on public.official_office_facts for select
  using (active = true);

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
