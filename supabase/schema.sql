-- Referee Dashboard schema (per-user, RLS enforced)
-- Run in Supabase SQL editor.
-- Includes a small migration section so existing installs can adapt.

create extension if not exists pgcrypto;

-- =========================
-- MIGRATIONS (best-effort)
-- =========================
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_settings') then
    create table public.user_settings (
      user_id uuid primary key,
      home_address text not null,
      assigning_platforms jsonb not null default '[]'::jsonb,
      leagues jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='games') then
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='league') then
      alter table public.games add column league text null;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='location_address') then
      alter table public.games add column location_address text null;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='location_name') then
        execute 'update public.games set location_address = coalesce(location_address, location_name)';
      end if;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='distance_miles') then
      alter table public.games add column distance_miles numeric null;
    end if;

    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='level_detail') then
      alter table public.games add column level_detail text null;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='roundtrip_miles') then
      alter table public.games add column roundtrip_miles numeric null;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='game_fee') then
      alter table public.games add column game_fee numeric null;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='paid_confirmed') then
      alter table public.games add column paid_confirmed boolean not null default false;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='paid_date') then
      alter table public.games add column paid_date date null;
    end if;

    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='platform_confirmations') then
      alter table public.games add column platform_confirmations jsonb not null default '{}'::jsonb;
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='calendar_events') then
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='calendar_events' and column_name='platform_confirmations') then
      alter table public.calendar_events add column platform_confirmations jsonb not null default '{}'::jsonb;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='calendar_events' and column_name='location_address') then
      alter table public.calendar_events add column location_address text null;
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name='calendar_events' and column_name='location_name') then
        execute 'update public.calendar_events set location_address = coalesce(location_address, location_name)';
      end if;
    end if;
  end if;
end $$;

-- =========================
-- TABLES (fresh install)
-- =========================

create table if not exists public.user_settings (
  user_id uuid primary key,
  home_address text not null,
  assigning_platforms jsonb not null default '[]'::jsonb,
  leagues jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sport text not null,
  competition_level text not null,
  league text null,
  level_detail text null,
  game_date date not null,
  start_time time null,
  location_address text not null,
  distance_miles numeric null,
  roundtrip_miles numeric null,
  role text null,
  status text not null,
  game_fee numeric null,
  paid_confirmed boolean not null default false,
  paid_date date null,
  pay_expected numeric null,
  home_team text null,
  away_team text null,
  notes text null,
  platform_confirmations jsonb not null default '{}'::jsonb,
  calendar_event_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  title text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'America/New_York',
  location_address text null,
  notes text null,
  source text not null,
  external_ref text null,
  status text not null,
  linked_game_id uuid null,
  platform_confirmations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games
  add constraint if not exists games_calendar_event_fk
  foreign key (calendar_event_id) references public.calendar_events(id)
  on delete set null;

alter table public.calendar_events
  add constraint if not exists calendar_events_linked_game_fk
  foreign key (linked_game_id) references public.games(id)
  on delete set null;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  expense_date date not null,
  amount numeric not null,
  category text not null,
  vendor text null,
  description text null,
  tax_deductible boolean not null default true,
  game_id uuid null references public.games(id) on delete set null,
  miles numeric null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requirement_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  governing_body text null,
  sport text null,
  competition_level text null,
  frequency text not null,
  required_count int null,
  evidence_type text not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requirement_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  definition_id uuid not null references public.requirement_definitions(id) on delete cascade,
  season_name text null,
  year int null,
  due_date date null,
  status text not null,
  completed_date date null,
  completion_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requirement_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instance_id uuid not null references public.requirement_instances(id) on delete cascade,
  activity_date date not null,
  quantity int not null default 1,
  result text null,
  evidence_link text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  import_type text not null,
  file_name text not null,
  imported_at timestamptz not null default now(),
  row_count int not null,
  notes text null
);

create table if not exists public.csv_import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  import_id uuid not null references public.csv_imports(id) on delete cascade,
  row_number int not null,
  raw_json jsonb not null,
  status text not null,
  error_message text null,
  created_calendar_event_id uuid null references public.calendar_events(id) on delete set null,
  created_game_id uuid null references public.games(id) on delete set null
);

-- =========================
-- RLS
-- =========================
alter table public.user_settings enable row level security;
alter table public.games enable row level security;
alter table public.calendar_events enable row level security;
alter table public.expenses enable row level security;
alter table public.requirement_definitions enable row level security;
alter table public.requirement_instances enable row level security;
alter table public.requirement_activities enable row level security;
alter table public.csv_imports enable row level security;
alter table public.csv_import_rows enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'user_settings',
    'games','calendar_events','expenses','requirement_definitions',
    'requirement_instances','requirement_activities','csv_imports','csv_import_rows'
  ]
  loop
    execute format('create policy if not exists "select_own_%1$s" on public.%1$s for select using (auth.uid() = user_id);', t);
    execute format('create policy if not exists "insert_own_%1$s" on public.%1$s for insert with check (auth.uid() = user_id);', t);
    execute format('create policy if not exists "update_own_%1$s" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('create policy if not exists "delete_own_%1$s" on public.%1$s for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

create index if not exists idx_games_user_date on public.games(user_id, game_date);
create index if not exists idx_expenses_user_date on public.expenses(user_id, expense_date);
create index if not exists idx_calendar_user_start on public.calendar_events(user_id, start_ts);
