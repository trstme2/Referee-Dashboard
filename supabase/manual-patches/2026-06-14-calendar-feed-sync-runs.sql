create table if not exists public.calendar_feed_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feed_id uuid null,
  feed_name text not null,
  platform text not null,
  trigger text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms int not null default 0,
  attempts int not null default 0,
  created_events int not null default 0,
  updated_events int not null default 0,
  created_games int not null default 0,
  updated_games int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.calendar_feed_sync_runs enable row level security;

drop policy if exists "select_own_calendar_feed_sync_runs" on public.calendar_feed_sync_runs;
create policy "select_own_calendar_feed_sync_runs"
on public.calendar_feed_sync_runs for select
using (auth.uid() = user_id);

drop policy if exists "insert_own_calendar_feed_sync_runs" on public.calendar_feed_sync_runs;
create policy "insert_own_calendar_feed_sync_runs"
on public.calendar_feed_sync_runs for insert
with check (auth.uid() = user_id);

drop policy if exists "update_own_calendar_feed_sync_runs" on public.calendar_feed_sync_runs;
create policy "update_own_calendar_feed_sync_runs"
on public.calendar_feed_sync_runs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete_own_calendar_feed_sync_runs" on public.calendar_feed_sync_runs;
create policy "delete_own_calendar_feed_sync_runs"
on public.calendar_feed_sync_runs for delete
using (auth.uid() = user_id);

create index if not exists idx_calendar_feed_sync_runs_user_started
on public.calendar_feed_sync_runs(user_id, started_at desc);

create index if not exists idx_calendar_feed_sync_runs_feed_started
on public.calendar_feed_sync_runs(feed_id, started_at desc);
