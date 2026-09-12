-- Okapi: artifacts multi-fichiers (Studio) + images metadata
-- Run in Supabase SQL Editor

alter table public.projects
  add column if not exists artifacts jsonb not null default '{}'::jsonb;

comment on column public.projects.artifacts is
  'Bundle Studio: react, reactNative, nextjs, sql, api, python, flutter, readme, images[]';

-- Keep html as primary preview; artifacts holds the rest
