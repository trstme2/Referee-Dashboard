create table if not exists public.beta_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null unique,
  full_name text not null,
  region text not null,
  sports jsonb not null default '[]'::jsonb,
  platforms jsonb not null default '[]'::jsonb,
  device_preference text not null,
  notes text null,
  status text not null default 'new' check (status in ('new','waitlisted','invited','rejected')),
  admin_notes text null,
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  invited_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.beta_access_requests enable row level security;

create index if not exists idx_beta_access_requests_status_created
on public.beta_access_requests(status, created_at desc);

create index if not exists idx_beta_access_requests_created
on public.beta_access_requests(created_at desc);
