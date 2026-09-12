-- Fix inscription Okapi (erreur "Database error saving new user")
-- Coller dans Supabase → SQL Editor → Run

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  city text default 'Kinshasa',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

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
    -- Ne jamais bloquer la création du compte auth
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
