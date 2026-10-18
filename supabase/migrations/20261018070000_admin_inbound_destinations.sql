-- Per-business-number inbound destinations, managed by existing Admin number policies.
begin;
alter table public.outreach_inbound_settings alter column cellphone_number drop not null;
alter table public.callcenter_phone_numbers
 add column if not exists inbound_destination text not null default 'app',
 add column if not exists inbound_forward_number text;
do $$ begin
 if not exists (select 1 from pg_constraint where conrelid='public.callcenter_phone_numbers'::regclass and conname='phone_inbound_destination_check') then
  alter table public.callcenter_phone_numbers add constraint phone_inbound_destination_check
   check (inbound_destination in ('app','forward') and
     (inbound_destination <> 'forward' or (inbound_forward_number is not null and
       inbound_forward_number ~ '^\+[1-9][0-9]{7,14}$' and inbound_forward_number <> phone_number)));
 end if;
end $$;
alter table public.outreach_inbound_calls
 add column if not exists route_destination text not null default 'app',
 add column if not exists forward_number text;
-- Pin routing to the incoming call so later Admin edits affect subsequent calls.
commit;
