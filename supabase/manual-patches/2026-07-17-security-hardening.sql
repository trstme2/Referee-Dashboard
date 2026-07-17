-- Whistle Keeper security hardening, July 17, 2026.
-- Run once in the Supabase SQL Editor after deploying the matching application code.

begin;

-- Recreate browser-facing policies with explicit authenticated roles and an
-- ownership predicate. This avoids relying on the broader public role.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'games', 'calendar_events', 'expenses', 'requirement_definitions',
    'requirement_instances', 'requirement_activities', 'csv_imports', 'csv_import_rows'
  ]
  loop
    execute format('drop policy if exists "select_own_%1$s" on public.%1$s;', t);
    execute format('create policy "select_own_%1$s" on public.%1$s for select to authenticated using ((select auth.uid()) = user_id);', t);
    execute format('drop policy if exists "insert_own_%1$s" on public.%1$s;', t);
    execute format('create policy "insert_own_%1$s" on public.%1$s for insert to authenticated with check ((select auth.uid()) = user_id);', t);
    execute format('drop policy if exists "update_own_%1$s" on public.%1$s;', t);
    execute format('create policy "update_own_%1$s" on public.%1$s for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);', t);
    execute format('drop policy if exists "delete_own_%1$s" on public.%1$s;', t);
    execute format('create policy "delete_own_%1$s" on public.%1$s for delete to authenticated using ((select auth.uid()) = user_id);', t);
  end loop;
end $$;

drop policy if exists "select_own_user_profiles" on public.user_profiles;
create policy "select_own_user_profiles" on public.user_profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "select_own_app_events" on public.app_events;
create policy "select_own_app_events" on public.app_events for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "delete_own_app_events" on public.app_events;
create policy "delete_own_app_events" on public.app_events for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.api_rate_limit_buckets (
  bucket text not null,
  subject_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (bucket, subject_hash),
  check (char_length(bucket) between 1 and 120),
  check (char_length(subject_hash) = 64)
);

-- Feed configuration, queue state, sync history, beta requests, and rate limits
-- are managed only by verified server routes. The browser role must not access them.
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array['calendar_feeds', 'calendar_feed_sync_runs', 'calendar_sync_jobs', 'beta_access_requests', 'api_rate_limit_buckets']
  loop
    execute format('alter table public.%1$s enable row level security;', t);
    for policy_name in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', policy_name, t);
    end loop;
  end loop;
end $$;

revoke all privileges on table public.calendar_feeds, public.calendar_feed_sync_runs, public.calendar_sync_jobs, public.beta_access_requests, public.api_rate_limit_buckets from anon, authenticated;

-- Durable, hashed-subject rate-limit buckets. This table has no browser policies;
-- only the server's Supabase secret key calls the function below.
create index if not exists idx_api_rate_limit_buckets_expiry on public.api_rate_limit_buckets(window_started_at);

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if char_length(coalesce(p_bucket, '')) not between 1 and 120
    or char_length(coalesce(p_subject_hash, '')) <> 64
    or p_limit < 1
    or p_limit > 100000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.api_rate_limit_buckets(bucket, subject_hash, window_started_at, request_count)
  values (p_bucket, p_subject_hash, v_now, 1)
  on conflict (bucket, subject_hash) do update
  set window_started_at = case
        when public.api_rate_limit_buckets.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then v_now
        else public.api_rate_limit_buckets.window_started_at
      end,
      request_count = case
        when public.api_rate_limit_buckets.window_started_at <= v_now - make_interval(secs => p_window_seconds)
          then 1
        else public.api_rate_limit_buckets.request_count + 1
      end
  returning window_started_at, request_count into v_window_started_at, v_request_count;

  allowed := v_request_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

commit;
