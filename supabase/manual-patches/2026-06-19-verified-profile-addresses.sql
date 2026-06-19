alter table public.user_settings
  add column if not exists home_address_place_id text null,
  add column if not exists home_address_latitude numeric null,
  add column if not exists home_address_longitude numeric null,
  add column if not exists other_work_address_place_id text null,
  add column if not exists other_work_address_latitude numeric null,
  add column if not exists other_work_address_longitude numeric null;

alter table public.user_settings
  alter column tracked_sports set default '[]'::jsonb;
