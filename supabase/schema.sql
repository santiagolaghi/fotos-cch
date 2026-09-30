create extension if not exists pgcrypto;

create table if not exists public.onedrive_accounts (
  id uuid primary key default gen_random_uuid(),
  slot smallint not null unique check (slot in (1,2)),
  microsoft_user_id text not null,
  display_name text,
  email text,
  drive_id text not null,
  drive_type text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  access_expires_at timestamptz not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.virtual_albums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_smart boolean not null default false,
  rule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.virtual_album_items (
  album_id uuid not null references public.virtual_albums(id) on delete cascade,
  account_id uuid not null references public.onedrive_accounts(id) on delete cascade,
  drive_item_id text not null,
  added_at timestamptz not null default now(),
  primary key (album_id, account_id, drive_item_id)
);

create table if not exists public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  title text,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.review_actions (
  id bigserial primary key,
  session_id uuid not null references public.review_sessions(id) on delete cascade,
  account_id uuid not null references public.onedrive_accounts(id) on delete cascade,
  drive_item_id text not null,
  action text not null check (action in ('keep','trash','skip')),
  created_at timestamptz not null default now(),
  unique(session_id, account_id, drive_item_id)
);

create table if not exists public.delete_queue (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.onedrive_accounts(id) on delete cascade,
  drive_item_id text not null,
  original_name text,
  queued_at timestamptz not null default now(),
  execute_after timestamptz not null default (now() + interval '24 hours'),
  status text not null default 'queued' check (status in ('queued','cancelled','deleted','failed')),
  deleted_at timestamptz,
  error text
);

alter table public.onedrive_accounts enable row level security;
alter table public.virtual_albums enable row level security;
alter table public.virtual_album_items enable row level security;
alter table public.review_sessions enable row level security;
alter table public.review_actions enable row level security;
alter table public.delete_queue enable row level security;

revoke all on public.onedrive_accounts from anon, authenticated;
revoke all on public.virtual_albums from anon, authenticated;
revoke all on public.virtual_album_items from anon, authenticated;
revoke all on public.review_sessions from anon, authenticated;
revoke all on public.review_actions from anon, authenticated;
revoke all on public.delete_queue from anon, authenticated;
