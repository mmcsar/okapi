-- Fix rapide Okapi : droits + policies (à coller dans Supabase SQL Editor)

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update on table public.profiles to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update using (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete using (auth.uid() = user_id);
