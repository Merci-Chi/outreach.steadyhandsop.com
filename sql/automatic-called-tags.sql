-- Run AFTER lead-disposition-consistency.sql (the previous fix).
-- Called is maintained from call evidence, never from a manually selected Called tag.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';

create or replace function crm_dnc_private.called_evidence(record jsonb)
returns boolean language sql immutable set search_path='' as $$
 select nullif(record->>'lastcalled','') is not null
 or regexp_replace(lower(coalesce(record->>'outcome','')),'[^a-z]','','g') in
 ('called','noanswer','leftvoicemail','voicemail','busy','wrongnumber','invalidnumber','disconnected','numberdisconnected','notinterested','followup','good','bad','haswebsite','hasawebsite','interested')
 or exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(record->'tags')='array' then record->'tags' else '[]'::jsonb end) t
 where regexp_replace(lower(t),'[^a-z]','','g') in
 ('noanswer','leftvoicemail','voicemail','busy','wrongnumber','invalidnumber','disconnected','numberdisconnected','notinterested'));
$$;
revoke all on function crm_dnc_private.called_evidence(jsonb) from public,anon,authenticated;

create or replace function crm_dnc_private.maintain_called_tag()
returns trigger language plpgsql security definer set search_path='' as $$
declare was_called boolean; clean_tags jsonb;
begin
 was_called := crm_dnc_private.called_evidence(to_jsonb(new)) or exists(
   select 1 from public.callcenter_call_activity a where a.crm_id=new.id
   and regexp_replace(lower(coalesce(a.outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall'));
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into clean_tags
 from jsonb_array_elements(case when jsonb_typeof(new.tags)='array' then new.tags else '[]'::jsonb end) with ordinality t(value,ord)
 where regexp_replace(lower(value #>> '{}'),'[^a-z]','','g')<>'called'
 and (not was_called or regexp_replace(lower(value #>> '{}'),'[^a-z]','','g') not in ('notstarted','notattempted','uncalled'));
 new.tags := clean_tags || case when was_called then '["Called"]'::jsonb else '[]'::jsonb end;
 if was_called and regexp_replace(lower(coalesce(new.stage,'')),'[^a-z]','','g') in ('','new','notstarted') then
   new.stage := case when crm_dnc_private.is_dnc_record(to_jsonb(new)) and tg_table_name='crm' then 'donotcall'
     when exists(select 1 from crm_dnc_private.disposition_values(to_jsonb(new)) v where v='notinterested') then 'notinterested'
     else 'outreach' end;
 end if;
 return new;
end $$;
revoke all on function crm_dnc_private.maintain_called_tag() from public,anon,authenticated;
drop trigger if exists crm_auto_called_tag on public.crm;
create trigger crm_auto_called_tag before insert or update on public.crm
 for each row execute function crm_dnc_private.maintain_called_tag();
drop trigger if exists crm_auto_called_tag on public."callcenter-leads";
create trigger crm_auto_called_tag before insert or update on public."callcenter-leads"
 for each row execute function crm_dnc_private.maintain_called_tag();

-- Keep queue entries in sync even if the caller closes the browser after a call.
create index if not exists outreach_queue_items_crm_contact_idx on public.outreach_queue_items(crm_id);
create or replace function crm_dnc_private.complete_called_queue_items()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tags @> '["Called"]'::jsonb then
   update public.outreach_queue_items set status='completed' where crm_id=new.id::text and status<>'completed';
 end if;
 return new;
end $$;
revoke all on function crm_dnc_private.complete_called_queue_items() from public,anon,authenticated;
drop trigger if exists crm_complete_called_queue on public.crm;
create trigger crm_complete_called_queue after insert or update of tags,lastcalled,outcome on public.crm
 for each row execute function crm_dnc_private.complete_called_queue_items();

create or replace function crm_dnc_private.guard_called_queue_item()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.crm_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   if exists(select 1 from public.crm c where c.id=new.crm_id::uuid and c.tags @> '["Called"]'::jsonb) then new.status := 'completed'; end if;
 end if;
 return new;
end $$;
revoke all on function crm_dnc_private.guard_called_queue_item() from public,anon,authenticated;
drop trigger if exists outreach_queue_called_status on public.outreach_queue_items;
create trigger outreach_queue_called_status before insert or update on public.outreach_queue_items
 for each row execute function crm_dnc_private.guard_called_queue_item();

create table if not exists crm_dnc_private.called_tag_backup(
 source_table text not null,lead_id text not null,original_record jsonb not null,
 recorded_at timestamptz not null default now(),primary key(source_table,lead_id));
alter table crm_dnc_private.called_tag_backup enable row level security;
revoke all on crm_dnc_private.called_tag_backup from public,anon,authenticated;

-- Target candidates cheaply; the trigger verifies evidence before adding Called.
-- Each repair statement owns its candidate CTE; no temporary/session table is required.
with called_tag_repair_ids as (
select id from public.crm where lastcalled is not null or coalesce(outcome,'') ~* '^(called|no.?answer|left.?voicemail|voicemail|busy|wrong.?number|invalid.?number|disconnected|number.?disconnected|not.?interested|follow.?up|good|bad|has.?a?.?website|interested)$'
 or tags::text ~* '(called|no.?answer|voicemail|busy|wrong.?number|invalid.?number|disconnected|not.?interested)'
 union select crm_id from public.callcenter_call_activity where crm_id is not null
 and regexp_replace(lower(coalesce(outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall')
)
insert into crm_dnc_private.called_tag_backup(source_table,lead_id,original_record)
 select 'crm',c.id::text,to_jsonb(c) from public.crm c join called_tag_repair_ids r on r.id=c.id on conflict do nothing;

with called_tag_repair_ids as (
select id from public.crm where lastcalled is not null or coalesce(outcome,'') ~* '^(called|no.?answer|left.?voicemail|voicemail|busy|wrong.?number|invalid.?number|disconnected|number.?disconnected|not.?interested|follow.?up|good|bad|has.?a?.?website|interested)$'
 or tags::text ~* '(called|no.?answer|voicemail|busy|wrong.?number|invalid.?number|disconnected|not.?interested)'
 union select crm_id from public.callcenter_call_activity where crm_id is not null
 and regexp_replace(lower(coalesce(outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall')
)
insert into crm_dnc_private.called_tag_backup(source_table,lead_id,original_record)
 select 'outreach_queue_items',i.id::text,to_jsonb(i) from public.outreach_queue_items i
 join called_tag_repair_ids r on r.id::text=i.crm_id on conflict do nothing;

with called_tag_repair_ids as (
select id from public.crm where lastcalled is not null or coalesce(outcome,'') ~* '^(called|no.?answer|left.?voicemail|voicemail|busy|wrong.?number|invalid.?number|disconnected|number.?disconnected|not.?interested|follow.?up|good|bad|has.?a?.?website|interested)$'
 or tags::text ~* '(called|no.?answer|voicemail|busy|wrong.?number|invalid.?number|disconnected|not.?interested)'
 union select crm_id from public.callcenter_call_activity where crm_id is not null
 and regexp_replace(lower(coalesce(outcome,'')),'[^a-z]','','g') not in ('didnotcall','didntcall')
)
update public.crm c set tags=c.tags from called_tag_repair_ids r where c.id=r.id;

insert into crm_dnc_private.called_tag_backup(source_table,lead_id,original_record)
 select 'callcenter-leads',c.id::text,to_jsonb(c) from public."callcenter-leads" c
 where c.lastcalled is not null or coalesce(c.outcome,'') ~* '^(called|no.?answer|left.?voicemail|voicemail|busy|wrong.?number|invalid.?number|disconnected|number.?disconnected|not.?interested|follow.?up|good|bad|has.?a?.?website|interested)$'
 or c.tags::text ~* '(called|no.?answer|voicemail|busy|wrong.?number|invalid.?number|disconnected|not.?interested)' on conflict do nothing;
update public."callcenter-leads" c set tags=c.tags
 where c.lastcalled is not null or coalesce(c.outcome,'') ~* '^(called|no.?answer|left.?voicemail|voicemail|busy|wrong.?number|invalid.?number|disconnected|number.?disconnected|not.?interested|follow.?up|good|bad|has.?a?.?website|interested)$'
 or c.tags::text ~* '(called|no.?answer|voicemail|busy|wrong.?number|invalid.?number|disconnected|not.?interested)';
commit;
