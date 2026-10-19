-- Phone forwarding does not require a browser identity. Keep unattributed calls
-- private: existing user_id=auth.uid() read policies remain unchanged.
begin;
alter table public.outreach_inbound_calls alter column user_id drop not null;
commit;
