-- Okapi Mobile Pay — abonnements + paiements Mobile Money (RDC)
-- À exécuter dans Supabase SQL Editor

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null default 'free',
  status text not null default 'inactive'
    check (status in ('inactive', 'pending', 'active', 'past_due', 'cancelled')),
  phone text,
  operator text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.mobile_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id text not null,
  amount_cdf integer not null,
  currency text not null default 'CDF',
  operator text not null
    check (operator in ('mpesa', 'orange', 'airtel')),
  phone text not null,
  reference text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled')),
  provider text not null default 'manual',
  provider_ref text,
  meta jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mobile_payments_user_idx
  on public.mobile_payments (user_id, created_at desc);

create index if not exists mobile_payments_status_idx
  on public.mobile_payments (status);

alter table public.subscriptions enable row level security;
alter table public.mobile_payments enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "subscriptions_upsert_own" on public.subscriptions;
create policy "subscriptions_upsert_own"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "subscriptions_update_own" on public.subscriptions;
create policy "subscriptions_update_own"
  on public.subscriptions for update
  using (auth.uid() = user_id);

drop policy if exists "payments_select_own" on public.mobile_payments;
create policy "payments_select_own"
  on public.mobile_payments for select
  using (auth.uid() = user_id);

drop policy if exists "payments_insert_own" on public.mobile_payments;
create policy "payments_insert_own"
  on public.mobile_payments for insert
  with check (auth.uid() = user_id);

comment on table public.subscriptions is 'Abonnement Okapi (Flash / Pro)';
comment on table public.mobile_payments is 'Paiements Mobile Money (M-Pesa, Orange, Airtel)';
