-- Previously contacted leads remain callable for follow-up.
-- Preserve private phone suppression, invalid/not-interested dispositions and archives.
create or replace function crm_dnc_private.record_call_blocked(record jsonb)
returns boolean language sql immutable set search_path='' as $$
 select crm_dnc_private.is_dnc_record(record)
   or coalesce(record->>'admin_archived'='true',false)
   or crm_dnc_private.terminal_disposition(record);
$$;
revoke all on function crm_dnc_private.record_call_blocked(jsonb) from public,anon,authenticated;
