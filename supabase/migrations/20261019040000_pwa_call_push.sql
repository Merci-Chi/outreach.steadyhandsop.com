begin;
create table if not exists public.outreach_inbound_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists outreach_inbound_push_owner_idx
  on public.outreach_inbound_push_subscriptions(user_id) where enabled;
create table if not exists public.outreach_inbound_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  ready boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,device_id)
);
alter table public.outreach_inbound_push_subscriptions enable row level security;
alter table public.outreach_inbound_devices enable row level security;
revoke all on public.outreach_inbound_push_subscriptions,public.outreach_inbound_devices from public,anon,authenticated;
grant all on public.outreach_inbound_push_subscriptions,public.outreach_inbound_devices to service_role;
alter table public.outreach_inbound_calls
  add column if not exists push_wait_until timestamptz,
  add column if not exists browser_attempted_at timestamptz,
  add column if not exists browser_alerted_at timestamptz;
commit;
