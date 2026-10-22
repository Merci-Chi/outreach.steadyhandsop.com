-- A pipeline stage alone is not evidence that a call took place.
-- Keep timestamps, actual dispositions, private suppression and call history intact.
create or replace function crm_dnc_private.has_contact(record jsonb)
returns boolean language sql immutable set search_path='' as $$
 select nullif(record->>'lastcalled','') is not null or exists(
   select 1 from crm_dnc_private.disposition_values(record) v where v in
   ('called','review','complete','callback','followup','notinterested','wrongnumber','invalidnumber',
    'disconnected','numberdisconnected','noanswer','leftvoicemail','voicemail','busy','interested','donotcall','donotcontact','dnc',
    'haswebsite','hasawebsite','good','bad'));
$$;
revoke all on function crm_dnc_private.has_contact(jsonb) from public,anon,authenticated;
