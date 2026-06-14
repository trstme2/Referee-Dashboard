create table if not exists public.user_profiles (
  user_id uuid primary key,
  email text null,
  role text not null default 'user' check (role in ('user','support','admin','owner')),
  subscription_tier text not null default 'free' check (subscription_tier in ('free','pro','premium')),
  subscription_status text not null default 'free' check (subscription_status in ('free','trialing','active','past_due','canceled')),
  stripe_customer_id text null,
  stripe_subscription_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz null
);

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  event_type text not null,
  event_source text not null default 'app',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
alter table public.app_events enable row level security;

drop policy if exists "select_own_user_profiles" on public.user_profiles;
create policy "select_own_user_profiles"
on public.user_profiles for select
using (auth.uid() = user_id);

drop policy if exists "select_own_app_events" on public.app_events;
create policy "select_own_app_events"
on public.app_events for select
using (auth.uid() = user_id);

drop policy if exists "delete_own_app_events" on public.app_events;
create policy "delete_own_app_events"
on public.app_events for delete
using (auth.uid() = user_id);

create index if not exists idx_user_profiles_role
on public.user_profiles(role);

create index if not exists idx_user_profiles_subscription_tier
on public.user_profiles(subscription_tier);

create index if not exists idx_user_profiles_last_seen
on public.user_profiles(last_seen_at desc);

create index if not exists idx_app_events_user_created
on public.app_events(user_id, created_at desc);

create index if not exists idx_app_events_type_created
on public.app_events(event_type, created_at desc);
