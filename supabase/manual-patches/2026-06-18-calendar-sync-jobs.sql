create table if not exists public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feed_id uuid not null,
  feed_name text not null,
  platform text not null,
  trigger text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','partial','failed')),
  priority int not null default 10,
  run_after timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  lease_owner text null,
  lease_expires_at timestamptz null,
  started_at timestamptz null,
  finished_at timestamptz null,
  last_error text null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_sync_jobs enable row level security;

drop policy if exists "select_own_calendar_sync_jobs" on public.calendar_sync_jobs;
create policy "select_own_calendar_sync_jobs"
on public.calendar_sync_jobs for select
using (auth.uid() = user_id);

drop policy if exists "insert_own_calendar_sync_jobs" on public.calendar_sync_jobs;
create policy "insert_own_calendar_sync_jobs"
on public.calendar_sync_jobs for insert
with check (auth.uid() = user_id);

drop policy if exists "update_own_calendar_sync_jobs" on public.calendar_sync_jobs;
create policy "update_own_calendar_sync_jobs"
on public.calendar_sync_jobs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "delete_own_calendar_sync_jobs" on public.calendar_sync_jobs;
create policy "delete_own_calendar_sync_jobs"
on public.calendar_sync_jobs for delete
using (auth.uid() = user_id);

create index if not exists idx_calendar_sync_jobs_due
on public.calendar_sync_jobs(status, run_after, priority desc);

create index if not exists idx_calendar_sync_jobs_user_created
on public.calendar_sync_jobs(user_id, created_at desc);

create index if not exists idx_calendar_sync_jobs_feed_status
on public.calendar_sync_jobs(feed_id, status);

create unique index if not exists idx_calendar_sync_jobs_one_active_per_feed
on public.calendar_sync_jobs(feed_id)
where status in ('queued','running');
