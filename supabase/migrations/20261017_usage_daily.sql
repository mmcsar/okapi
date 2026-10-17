-- Quota journalier partagé entre tous les serveurs Okapi.
-- À lancer une fois dans Supabase → SQL Editor.
-- Sans cette table, Okapi retombe sur un compteur en mémoire (un seul processus).

create table if not exists public.okapi_usage_daily (
  quota_key text not null,
  day date not null,
  chat_count integer not null default 0,
  generate_count integer not null default 0,
  primary key (quota_key, day)
);

alter table public.okapi_usage_daily enable row level security;

revoke all on table public.okapi_usage_daily from public, anon, authenticated;
grant select, insert, update, delete on table public.okapi_usage_daily to service_role;

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

revoke all on function public.okapi_consume_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.okapi_consume_quota(text, text, integer) to service_role;
