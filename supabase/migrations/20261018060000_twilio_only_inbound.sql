-- Browser-only Twilio routing does not require a personal forwarding number.
-- Existing rows are preserved for compatibility; the new functions never dial them.
begin;
alter table public.outreach_inbound_settings
  alter column cellphone_number drop not null;
comment on column public.outreach_inbound_settings.cellphone_number is
  'Legacy forwarding field. Twilio-only inbound routing ignores this field.';
commit;
