-- Whistle Keeper production schema drift check.
-- Run this in Supabase SQL Editor before or after deploys.
-- Expected result for a healthy production database: zero rows.
--
-- This script is read-only. If it returns rows, run supabase/schema.sql,
-- then run this check again.

with expected_tables(table_name) as (
  values
    ('user_settings'),
    ('user_profiles'),
    ('app_events'),
    ('games'),
    ('calendar_events'),
    ('calendar_feeds'),
    ('calendar_feed_sync_runs'),
    ('expenses'),
    ('requirement_definitions'),
    ('requirement_instances'),
    ('requirement_activities'),
    ('csv_imports'),
    ('csv_import_rows')
),
expected_columns(table_name, column_name) as (
  values
    ('user_settings', 'user_id'),
    ('user_settings', 'home_address'),
    ('user_settings', 'other_work_address'),
    ('user_settings', 'default_timezone'),
    ('user_settings', 'tax_mileage_rate_cents'),
    ('user_settings', 'weekly_games_email_enabled'),
    ('user_settings', 'onboarding_completed_at'),
    ('user_settings', 'calendar_export_token'),
    ('user_settings', 'tracked_sports'),
    ('user_settings', 'show_game_platform_chips'),
    ('user_settings', 'assigning_platforms'),
    ('user_settings', 'leagues'),
    ('user_settings', 'updated_at'),

    ('user_profiles', 'user_id'),
    ('user_profiles', 'email'),
    ('user_profiles', 'role'),
    ('user_profiles', 'subscription_tier'),
    ('user_profiles', 'subscription_status'),
    ('user_profiles', 'stripe_customer_id'),
    ('user_profiles', 'stripe_subscription_id'),
    ('user_profiles', 'created_at'),
    ('user_profiles', 'updated_at'),
    ('user_profiles', 'last_seen_at'),

    ('app_events', 'id'),
    ('app_events', 'user_id'),
    ('app_events', 'event_type'),
    ('app_events', 'event_source'),
    ('app_events', 'metadata'),
    ('app_events', 'created_at'),

    ('games', 'id'),
    ('games', 'user_id'),
    ('games', 'sport'),
    ('games', 'competition_level'),
    ('games', 'league'),
    ('games', 'level_detail'),
    ('games', 'game_date'),
    ('games', 'start_time'),
    ('games', 'timezone'),
    ('games', 'location_address'),
    ('games', 'distance_miles'),
    ('games', 'roundtrip_miles'),
    ('games', 'mileage_origin'),
    ('games', 'role'),
    ('games', 'status'),
    ('games', 'game_fee'),
    ('games', 'paid_confirmed'),
    ('games', 'paid_date'),
    ('games', 'pay_expected'),
    ('games', 'home_team'),
    ('games', 'away_team'),
    ('games', 'notes'),
    ('games', 'platform_confirmations'),
    ('games', 'calendar_event_id'),
    ('games', 'created_at'),
    ('games', 'updated_at'),

    ('calendar_events', 'id'),
    ('calendar_events', 'user_id'),
    ('calendar_events', 'event_type'),
    ('calendar_events', 'title'),
    ('calendar_events', 'start_ts'),
    ('calendar_events', 'end_ts'),
    ('calendar_events', 'all_day'),
    ('calendar_events', 'timezone'),
    ('calendar_events', 'location_address'),
    ('calendar_events', 'notes'),
    ('calendar_events', 'source'),
    ('calendar_events', 'external_ref'),
    ('calendar_events', 'status'),
    ('calendar_events', 'linked_game_id'),
    ('calendar_events', 'platform_confirmations'),
    ('calendar_events', 'created_at'),
    ('calendar_events', 'updated_at'),

    ('calendar_feeds', 'id'),
    ('calendar_feeds', 'user_id'),
    ('calendar_feeds', 'platform'),
    ('calendar_feeds', 'name'),
    ('calendar_feeds', 'feed_url'),
    ('calendar_feeds', 'enabled'),
    ('calendar_feeds', 'sport'),
    ('calendar_feeds', 'default_league'),
    ('calendar_feeds', 'import_start_date'),
    ('calendar_feeds', 'last_synced_at'),
    ('calendar_feeds', 'created_at'),
    ('calendar_feeds', 'updated_at'),

    ('calendar_feed_sync_runs', 'id'),
    ('calendar_feed_sync_runs', 'user_id'),
    ('calendar_feed_sync_runs', 'feed_id'),
    ('calendar_feed_sync_runs', 'feed_name'),
    ('calendar_feed_sync_runs', 'platform'),
    ('calendar_feed_sync_runs', 'trigger'),
    ('calendar_feed_sync_runs', 'status'),
    ('calendar_feed_sync_runs', 'started_at'),
    ('calendar_feed_sync_runs', 'finished_at'),
    ('calendar_feed_sync_runs', 'duration_ms'),
    ('calendar_feed_sync_runs', 'attempts'),
    ('calendar_feed_sync_runs', 'created_events'),
    ('calendar_feed_sync_runs', 'updated_events'),
    ('calendar_feed_sync_runs', 'created_games'),
    ('calendar_feed_sync_runs', 'updated_games'),
    ('calendar_feed_sync_runs', 'errors'),
    ('calendar_feed_sync_runs', 'diagnostics'),
    ('calendar_feed_sync_runs', 'created_at'),

    ('expenses', 'id'),
    ('expenses', 'user_id'),
    ('expenses', 'expense_date'),
    ('expenses', 'amount'),
    ('expenses', 'category'),
    ('expenses', 'vendor'),
    ('expenses', 'description'),
    ('expenses', 'tax_deductible'),
    ('expenses', 'game_id'),
    ('expenses', 'miles'),
    ('expenses', 'receipt_storage_path'),
    ('expenses', 'receipt_file_name'),
    ('expenses', 'receipt_mime_type'),
    ('expenses', 'receipt_size_bytes'),
    ('expenses', 'notes'),
    ('expenses', 'created_at'),
    ('expenses', 'updated_at'),

    ('requirement_definitions', 'id'),
    ('requirement_definitions', 'user_id'),
    ('requirement_definitions', 'name'),
    ('requirement_definitions', 'governing_body'),
    ('requirement_definitions', 'sport'),
    ('requirement_definitions', 'competition_level'),
    ('requirement_definitions', 'frequency'),
    ('requirement_definitions', 'required_count'),
    ('requirement_definitions', 'evidence_type'),
    ('requirement_definitions', 'notes'),
    ('requirement_definitions', 'created_at'),
    ('requirement_definitions', 'updated_at'),

    ('requirement_instances', 'id'),
    ('requirement_instances', 'user_id'),
    ('requirement_instances', 'definition_id'),
    ('requirement_instances', 'season_name'),
    ('requirement_instances', 'year'),
    ('requirement_instances', 'due_date'),
    ('requirement_instances', 'status'),
    ('requirement_instances', 'completed_date'),
    ('requirement_instances', 'completion_notes'),
    ('requirement_instances', 'created_at'),
    ('requirement_instances', 'updated_at'),

    ('requirement_activities', 'id'),
    ('requirement_activities', 'user_id'),
    ('requirement_activities', 'instance_id'),
    ('requirement_activities', 'activity_date'),
    ('requirement_activities', 'quantity'),
    ('requirement_activities', 'result'),
    ('requirement_activities', 'evidence_link'),
    ('requirement_activities', 'evidence_storage_path'),
    ('requirement_activities', 'evidence_file_name'),
    ('requirement_activities', 'evidence_mime_type'),
    ('requirement_activities', 'evidence_size_bytes'),
    ('requirement_activities', 'notes'),
    ('requirement_activities', 'created_at'),
    ('requirement_activities', 'updated_at'),

    ('csv_imports', 'id'),
    ('csv_imports', 'user_id'),
    ('csv_imports', 'import_type'),
    ('csv_imports', 'file_name'),
    ('csv_imports', 'imported_at'),
    ('csv_imports', 'row_count'),
    ('csv_imports', 'notes'),

    ('csv_import_rows', 'id'),
    ('csv_import_rows', 'user_id'),
    ('csv_import_rows', 'import_id'),
    ('csv_import_rows', 'row_number'),
    ('csv_import_rows', 'raw_json'),
    ('csv_import_rows', 'status'),
    ('csv_import_rows', 'error_message'),
    ('csv_import_rows', 'created_calendar_event_id'),
    ('csv_import_rows', 'created_game_id')
),
expected_indexes(index_name) as (
  values
    ('idx_games_user_date'),
    ('idx_user_settings_calendar_export_token'),
    ('idx_user_profiles_role'),
    ('idx_user_profiles_subscription_tier'),
    ('idx_user_profiles_last_seen'),
    ('idx_app_events_user_created'),
    ('idx_app_events_type_created'),
    ('idx_expenses_user_date'),
    ('idx_calendar_user_start'),
    ('idx_calendar_events_user_external_ref'),
    ('idx_calendar_feeds_user_platform'),
    ('idx_calendar_feed_sync_runs_user_started'),
    ('idx_calendar_feed_sync_runs_feed_started')
),
expected_user_owned_tables(table_name) as (
  values
    ('user_settings'),
    ('games'),
    ('calendar_events'),
    ('calendar_feeds'),
    ('calendar_feed_sync_runs'),
    ('expenses'),
    ('requirement_definitions'),
    ('requirement_instances'),
    ('requirement_activities'),
    ('csv_imports'),
    ('csv_import_rows')
),
expected_table_policies(table_name, policy_name) as (
  select table_name, action || '_own_' || table_name
  from expected_user_owned_tables
  cross join (values ('select'), ('insert'), ('update'), ('delete')) as actions(action)
  union all
  select *
  from (values
    ('user_profiles', 'select_own_user_profiles'),
    ('app_events', 'select_own_app_events'),
    ('app_events', 'delete_own_app_events')
  ) as explicit_policies(table_name, policy_name)
),
expected_buckets(bucket_id) as (
  values
    ('requirement-evidence'),
    ('expense-receipts')
),
expected_storage_policies(policy_name) as (
  values
    ('requirement_evidence_select_own'),
    ('requirement_evidence_insert_own'),
    ('requirement_evidence_update_own'),
    ('requirement_evidence_delete_own'),
    ('expense_receipts_select_own'),
    ('expense_receipts_insert_own'),
    ('expense_receipts_update_own'),
    ('expense_receipts_delete_own')
),
findings as (
  select
    'missing_table' as issue,
    'public.' || table_name as object_name,
    'Run supabase/schema.sql to create the missing table.' as fix
  from expected_tables et
  where not exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = et.table_name
  )

  union all

  select
    'missing_column' as issue,
    'public.' || ec.table_name || '.' || ec.column_name as object_name,
    'Run supabase/schema.sql to add the missing column.' as fix
  from expected_columns ec
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = ec.table_name
      and c.column_name = ec.column_name
  )

  union all

  select
    'rls_disabled' as issue,
    'public.' || et.table_name as object_name,
    'Run supabase/schema.sql to enable row level security.' as fix
  from expected_tables et
  join pg_class cls on cls.relname = et.table_name
  join pg_namespace ns on ns.oid = cls.relnamespace and ns.nspname = 'public'
  where cls.relkind = 'r'
    and not cls.relrowsecurity

  union all

  select
    'missing_policy' as issue,
    'public.' || ep.table_name || ' policy ' || ep.policy_name as object_name,
    'Run supabase/schema.sql to recreate table RLS policies.' as fix
  from expected_table_policies ep
  where exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = ep.table_name
  )
    and not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = ep.table_name
        and p.policyname = ep.policy_name
    )

  union all

  select
    'missing_index' as issue,
    index_name as object_name,
    'Run supabase/schema.sql to create the missing index.' as fix
  from expected_indexes ei
  where not exists (
    select 1
    from pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = ei.index_name
  )

  union all

  select
    'missing_storage_bucket' as issue,
    'storage.buckets.' || eb.bucket_id as object_name,
    'Run supabase/schema.sql to create or repair the private storage bucket.' as fix
  from expected_buckets eb
  where not exists (
    select 1
    from storage.buckets b
    where b.id = eb.bucket_id
  )

  union all

  select
    'storage_bucket_public' as issue,
    'storage.buckets.' || eb.bucket_id as object_name,
    'Run supabase/schema.sql to mark the bucket private.' as fix
  from expected_buckets eb
  join storage.buckets b on b.id = eb.bucket_id
  where b.public

  union all

  select
    'missing_storage_policy' as issue,
    'storage.objects policy ' || esp.policy_name as object_name,
    'Run supabase/schema.sql to recreate storage access policies.' as fix
  from expected_storage_policies esp
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname = esp.policy_name
  )
)
select issue, object_name, fix
from findings
order by issue, object_name;
