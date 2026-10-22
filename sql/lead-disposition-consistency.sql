-- Shared by Admin and Outreach. Preserve the private DNC list and existing access controls.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';

create or replace function crm_dnc_private.disposition_values(record jsonb)
returns setof text language sql immutable set search_path='' as $$
  select regexp_replace(lower(value),'[^a-z]','','g') from (
    select record->>'stage' value union all select record->>'outcome'
    union all select jsonb_array_elements_text(case when jsonb_typeof(record->'tags')='array' then record->'tags' else '[]'::jsonb end)
  ) v;
$$;
create or replace function crm_dnc_private.terminal_disposition(record jsonb)
returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from crm_dnc_private.disposition_values(record) v where v in
 ('wrongnumber','invalidnumber','disconnected','numberdisconnected','notinterested','donotcall','donotcontact','dnc'));
$$;
create or replace function crm_dnc_private.has_contact(record jsonb)
returns boolean language sql immutable set search_path='' as $$
 select nullif(record->>'lastcalled','') is not null or exists(
   select 1 from crm_dnc_private.disposition_values(record) v where v in
   ('called','outreach','review','complete','callback','followup','notinterested','wrongnumber','invalidnumber',
    'disconnected','numberdisconnected','noanswer','leftvoicemail','voicemail','busy','interested','donotcall','donotcontact','dnc',
    'haswebsite','hasawebsite','good','bad'));
$$;
create or replace function crm_dnc_private.record_call_blocked(record jsonb)
returns boolean language sql immutable set search_path='' as $$
 select crm_dnc_private.is_dnc_record(record)
   or coalesce(record->>'admin_archived'='true',false)
   or crm_dnc_private.terminal_disposition(record)
   or (crm_dnc_private.has_contact(record) and not exists(
      select 1 from crm_dnc_private.disposition_values(record) v where v in ('noanswer','leftvoicemail','voicemail','busy')));
$$;
revoke all on function crm_dnc_private.disposition_values(jsonb),
 crm_dnc_private.terminal_disposition(jsonb),crm_dnc_private.has_contact(jsonb),
 crm_dnc_private.record_call_blocked(jsonb) from public,anon,authenticated;

-- Normalize only unstarted stages; retain actual pipeline progress and precise outcomes.
create or replace function crm_dnc_private.enforce_contact_stage()
returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb := to_jsonb(new);
begin
 if regexp_replace(lower(coalesce(new.stage,'')),'[^a-z]','','g') in ('','new','notstarted')
    and crm_dnc_private.has_contact(r) then
   new.stage := case
     when crm_dnc_private.is_dnc_record(r) and tg_table_name='crm' then 'donotcall'
     when exists(select 1 from crm_dnc_private.disposition_values(r) v where v='notinterested') then 'notinterested'
     else 'outreach' end;
 end if;
 return new;
end $$;
revoke all on function crm_dnc_private.enforce_contact_stage() from public,anon,authenticated;
drop trigger if exists crm_contact_stage_guard on public.crm;
create trigger crm_contact_stage_guard before insert or update on public.crm
 for each row execute function crm_dnc_private.enforce_contact_stage();
drop trigger if exists crm_contact_stage_guard on public."callcenter-leads";
create trigger crm_contact_stage_guard before insert or update on public."callcenter-leads"
 for each row execute function crm_dnc_private.enforce_contact_stage();

create index if not exists callcenter_activity_crm_contact_idx on public.callcenter_call_activity(crm_id) where crm_id is not null;

-- Calls must update the CRM even if the browser closes before its second write.
create or replace function crm_dnc_private.sync_contact_activity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.crm_id is not null and regexp_replace(lower(coalesce(new.outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall') then
   update public.crm c set lastcalled=greatest(c.lastcalled,coalesce(new.ended_at,new.created_at)),
     stage=case when regexp_replace(lower(coalesce(c.stage,'')),'[^a-z]','','g') in ('','new','notstarted') then 'outreach' else c.stage end
   where c.id=new.crm_id;
 end if;
 return new;
end $$;
revoke all on function crm_dnc_private.sync_contact_activity() from public,anon,authenticated;
drop trigger if exists crm_sync_contact_activity on public.callcenter_call_activity;
create trigger crm_sync_contact_activity after insert or update of outcome,ended_at on public.callcenter_call_activity
 for each row execute function crm_dnc_private.sync_contact_activity();

create table if not exists crm_dnc_private.contact_stage_backup(
 source_table text not null, lead_id uuid not null, original_record jsonb not null,
 recorded_at timestamptz not null default now(),primary key(source_table,lead_id));
alter table crm_dnc_private.contact_stage_backup enable row level security;
revoke all on crm_dnc_private.contact_stage_backup from public,anon,authenticated;

-- Back up only rows requiring repair, including call evidence missing from the CRM.
insert into crm_dnc_private.contact_stage_backup(source_table,lead_id,original_record)
select 'crm',c.id,to_jsonb(c) from public.crm c where
 (regexp_replace(lower(coalesce(c.stage,'')),'[^a-z]','','g') in ('','new','notstarted') and crm_dnc_private.has_contact(to_jsonb(c)))
 or exists(select 1 from public.callcenter_call_activity a where a.crm_id=c.id
   and regexp_replace(lower(coalesce(a.outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall')
   and (c.lastcalled is null or c.lastcalled<coalesce(a.ended_at,a.created_at)))
on conflict do nothing;
insert into crm_dnc_private.contact_stage_backup(source_table,lead_id,original_record)
select 'callcenter-leads',c.id,to_jsonb(c) from public."callcenter-leads" c
where regexp_replace(lower(coalesce(c.stage,'')),'[^a-z]','','g') in ('','new','notstarted')
 and crm_dnc_private.has_contact(to_jsonb(c)) on conflict do nothing;

update public.crm c set lastcalled=greatest(c.lastcalled,a.last_call)
from (select crm_id,max(coalesce(ended_at,created_at)) last_call from public.callcenter_call_activity
 where regexp_replace(lower(coalesce(outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall') group by crm_id) a
where c.id=a.crm_id and (c.lastcalled is null or c.lastcalled<a.last_call);
-- The trigger derives the stage from current outcome/tags without inventing call timestamps.
update public.crm c set stage=c.stage where regexp_replace(lower(coalesce(c.stage,'')),'[^a-z]','','g') in ('','new','notstarted')
 and crm_dnc_private.has_contact(to_jsonb(c));
update public."callcenter-leads" c set stage=c.stage where regexp_replace(lower(coalesce(c.stage,'')),'[^a-z]','','g') in ('','new','notstarted')
 and crm_dnc_private.has_contact(to_jsonb(c));

-- This existing RPC is also enforced by the signed Twilio webhook before Dial.
-- ID lookup and normalized-phone lookup use the existing primary/phone indexes.
create or replace function public.outreach_call_is_blocked(p_phone text,p_crm_id text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare normalized_phone text := crm_dnc_private.normalize_phone(p_phone); lead_id uuid;
begin
 if nullif(trim(p_phone),'') is null then return true; end if;
 if exists(select 1 from crm_dnc_private.suppressed_phones where phone=normalized_phone) then return true; end if;
 if p_crm_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   lead_id := p_crm_id::uuid;
   if exists(select 1 from public.crm c where c.id=lead_id and crm_dnc_private.record_call_blocked(to_jsonb(c))) then return true; end if;
 end if;
 if normalized_phone is not null and exists(select 1 from public.crm c where c.phone is not null
   and crm_dnc_private.normalize_phone(c.phone)=normalized_phone
   and crm_dnc_private.record_call_blocked(to_jsonb(c))) then return true; end if;
 return false;
end $$;
revoke all on function public.outreach_call_is_blocked(text,text) from public,anon;
grant execute on function public.outreach_call_is_blocked(text,text) to authenticated,service_role;
commit;
