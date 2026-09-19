-- Okapi app data (Preview réelle) — records JSON par projet / collection
-- Run in Supabase SQL Editor once.

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

alter table public.app_records enable row level security;

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

grant select, insert, update, delete on public.app_records to authenticated;
grant select on public.app_records to anon;
