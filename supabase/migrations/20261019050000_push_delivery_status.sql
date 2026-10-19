begin;
alter table public.outreach_inbound_push_subscriptions
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error text;
commit;
