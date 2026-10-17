begin;
create table if not exists public.outreach_inbound_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cellphone_number text not null check (cellphone_number ~ '^\+[1-9][0-9]{7,14}$'),
  enabled boolean not null default true,
  outreach_ring_seconds integer not null default 15 check (outreach_ring_seconds between 10 and 45),
  cellphone_ring_seconds integer not null default 20 check (cellphone_ring_seconds between 10 and 45),
  voicemail_greeting text not null default 'Thank you for calling Steady Hands. Please leave your name, number, and a message after the beep.' check (length(voicemail_greeting) between 1 and 500),
  updated_at timestamptz not null default now()
);
create table if not exists public.outreach_inbound_calls (
  call_sid text primary key check (call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  user_id uuid not null references auth.users(id),
  from_number text not null,
  to_number text not null,
  status text not null default 'ringing',
  answered_via text,
  cellphone_accepted boolean not null default false,
  forwarded_sid text,
  recording_sid text check (recording_sid is null or recording_sid ~ '^RE[0-9a-fA-F]{32}$'),
  recording_duration integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outreach_inbound_calls_user_created_idx on public.outreach_inbound_calls(user_id,created_at desc);
alter table public.outreach_inbound_settings enable row level security;
alter table public.outreach_inbound_calls enable row level security;
-- All writes go through authenticated/signed Edge Functions, never the browser.
revoke all on public.outreach_inbound_settings, public.outreach_inbound_calls from anon, authenticated;
grant select on public.outreach_inbound_settings, public.outreach_inbound_calls to authenticated;
grant all on public.outreach_inbound_settings, public.outreach_inbound_calls to service_role;
drop policy if exists inbound_settings_read_own on public.outreach_inbound_settings;
create policy inbound_settings_read_own on public.outreach_inbound_settings for select to authenticated using (user_id=auth.uid());
drop policy if exists inbound_calls_read_own on public.outreach_inbound_calls;
create policy inbound_calls_read_own on public.outreach_inbound_calls for select to authenticated using (user_id=auth.uid());
commit;
