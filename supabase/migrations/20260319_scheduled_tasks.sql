-- Okapi automatisations planifiées (Scheduled tasks)
-- Run in Supabase SQL Editor once.

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

alter table public.scheduled_tasks enable row level security;

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

grant select, insert, update, delete on public.scheduled_tasks to authenticated;
