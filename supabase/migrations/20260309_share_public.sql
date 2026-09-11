-- Export / partage public Okapi
-- Run in Supabase SQL Editor

alter table public.projects
  add column if not exists is_public boolean not null default false;

alter table public.projects
  add column if not exists share_slug text;

create unique index if not exists projects_share_slug_uidx
  on public.projects (share_slug)
  where share_slug is not null;

drop policy if exists "projects_public_read" on public.projects;
create policy "projects_public_read"
  on public.projects for select
  using (is_public = true);

grant select on table public.projects to anon;
