-- Uses the private DNC list already installed by dnc_mark_do_not_call.sql.
-- No DNC phone numbers or customer data are stored in this repository.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Stop rather than install an empty list that silently permits suppressed numbers.
do $$ begin
  if to_regclass('crm_dnc_private.suppressed_phones') is null then
    raise exception 'Install the uploaded DNC suppression list before this migration.';
  end if;
end $$;

create or replace function crm_dnc_private.normalize_phone(raw_phone text)
returns text language sql immutable strict set search_path = '' as $$
  select case when length(d) = 10 then d
    when length(d) = 11 and left(d,1) = '1' then substring(d from 2) else null end
  from (select regexp_replace(raw_phone,'[^0-9]','','g') as d) p;
$$;
revoke all on function crm_dnc_private.normalize_phone(text) from public, anon, authenticated;

create or replace function crm_dnc_private.is_dnc_record(record jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(record->>'do_not_call' = 'true', false)
    or exists (
      select 1 from (
        select record->>'stage' as value union all select record->>'outcome'
        union all
        select jsonb_array_elements_text(case when jsonb_typeof(record->'tags') = 'array'
          then record->'tags' else '[]'::jsonb end)
      ) flags
      where regexp_replace(lower(value), '[^a-z]', '', 'g') in ('donotcall','donotcontact','dnc')
    );
$$;
revoke all on function crm_dnc_private.is_dnc_record(jsonb) from public, anon, authenticated;

alter table public.crm add column if not exists do_not_call boolean not null default false;
create table if not exists crm_dnc_private.crm_record_backup (
  lead_id text primary key,
  original_record jsonb not null,
  recorded_at timestamptz not null default now()
);
alter table crm_dnc_private.crm_record_backup enable row level security;
revoke all on crm_dnc_private.crm_record_backup from public, anon, authenticated;

lock table public.crm in share row exclusive mode;
-- Existing CRM DNC dispositions become number-level suppressions as well.
insert into crm_dnc_private.suppressed_phones(phone, source)
select distinct crm_dnc_private.normalize_phone(c.phone), 'Existing CRM Do Not Call disposition'
from public.crm c
where crm_dnc_private.is_dnc_record(to_jsonb(c))
  and crm_dnc_private.normalize_phone(c.phone) is not null
on conflict (phone) do nothing;

insert into crm_dnc_private.crm_record_backup(lead_id, original_record)
select c.id::text, to_jsonb(c) from public.crm c
where exists (select 1 from crm_dnc_private.suppressed_phones d
  where d.phone = crm_dnc_private.normalize_phone(c.phone))
on conflict (lead_id) do nothing;

create or replace function crm_dnc_private.enforce_crm_dnc()
returns trigger language plpgsql security definer set search_path = '' as $$
declare normalized_phone text := crm_dnc_private.normalize_phone(new.phone);
begin
  if crm_dnc_private.is_dnc_record(to_jsonb(new)) and normalized_phone is not null then
    insert into crm_dnc_private.suppressed_phones(phone,source)
      values(normalized_phone,'CRM Do Not Call disposition') on conflict(phone) do nothing;
  end if;
  if exists(select 1 from crm_dnc_private.suppressed_phones where phone = normalized_phone) then
    new.do_not_call := true;
    new.stage := 'donotcall';
    new.outcome := 'Do Not Call';
    new.callbackdate := null;
    new.callbackat := null;
  end if;
  return new;
end $$;
revoke all on function crm_dnc_private.enforce_crm_dnc() from public, anon, authenticated;
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid = 'public.crm'::regclass
    and tgname = 'crm_dnc_suppression_guard') then
    create trigger crm_dnc_suppression_guard before insert or update on public.crm
      for each row execute function crm_dnc_private.enforce_crm_dnc();
  end if;
end $$;

update public.crm c set do_not_call = true, stage = 'donotcall', outcome = 'Do Not Call',
  callbackdate = null, callbackat = null
where exists(select 1 from crm_dnc_private.suppressed_phones d
  where d.phone = crm_dnc_private.normalize_phone(c.phone));

-- Callable by authenticated clients and the signed Twilio webhook's service client.
-- Returns only a boolean, never DNC list contents or other users' CRM records.
create or replace function public.outreach_call_is_blocked(p_phone text, p_crm_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare normalized_phone text := crm_dnc_private.normalize_phone(p_phone);
begin
  if nullif(trim(p_phone),'') is null then return true; end if;
  if exists(select 1 from crm_dnc_private.suppressed_phones d where d.phone = normalized_phone)
    then return true; end if;
  return exists(
    select 1 from public.crm c
    where (c.id::text = p_crm_id
      or (normalized_phone is not null and crm_dnc_private.normalize_phone(c.phone) = normalized_phone)
      or c.phone = p_phone)
      and crm_dnc_private.is_dnc_record(to_jsonb(c))
  );
end $$;
revoke all on function public.outreach_call_is_blocked(text,text) from public, anon;
grant execute on function public.outreach_call_is_blocked(text,text) to authenticated, service_role;

-- Shows the actual Outreach CRM matches, rather than the separate callcenter-leads table.
select count(*) as marked_crm_leads from public.crm where do_not_call = true;
commit;
