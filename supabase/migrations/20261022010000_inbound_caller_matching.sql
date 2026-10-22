-- Batch 1: resolve inbound callers without guessing, and preserve a stable match per call.
-- Apply manually in Supabase SQL Editor before deploying the paired inbound function.
begin;

alter table public.outreach_inbound_calls
  add column if not exists crm_id uuid references public.crm(id) on delete set null,
  add column if not exists caller_match_status text not null default 'unresolved';

alter table public.outreach_inbound_calls
  drop constraint if exists outreach_inbound_calls_caller_match_status_check;
alter table public.outreach_inbound_calls
  add constraint outreach_inbound_calls_caller_match_status_check
  check (caller_match_status in ('unresolved','matched','unknown','ambiguous'));

create index if not exists crm_inbound_assigned_phone_idx
  on public.crm(assigned_user_id);

create or replace function public.outreach_resolve_inbound_caller(p_call_sid text)
returns table(match_status text, matched_crm_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  incoming public.outreach_inbound_calls%rowtype;
  source_digits text;
  matches uuid[];
begin
  if p_call_sid is null or p_call_sid !~ '^CA[0-9a-fA-F]{32}$' then
    raise exception 'Invalid Call SID';
  end if;

  select * into strict incoming from public.outreach_inbound_calls
  where call_sid = p_call_sid for update;

  -- A call is a snapshot: retries must not switch a previously resolved caller.
  if incoming.caller_match_status <> 'unresolved' then
    return query select incoming.caller_match_status, incoming.crm_id;
    return;
  end if;

  source_digits := regexp_replace(incoming.from_number, '[^0-9]', '', 'g');

  -- Conservative US/Canada normalization: 10 digits, or 11 starting with 1.
  -- Other countries require complete digits including their country code.
  if length(source_digits) = 11 and left(source_digits, 1) = '1' then
    source_digits := right(source_digits, 10);
  end if;

  if incoming.user_id is null or length(source_digits) < 10 then
    update public.outreach_inbound_calls
      set caller_match_status = 'unknown', updated_at = now()
    where call_sid = p_call_sid;
    return query select 'unknown'::text, null::uuid;
    return;
  end if;

  select coalesce(array_agg(candidate.id), array[]::uuid[]) into matches
  from (
    select distinct c.id from public.crm c
    cross join lateral (values(c.phone), (c.altphone)) p(number)
    cross join lateral (
      select regexp_replace(coalesce(p.number, ''), '[^0-9]', '', 'g') as digits
    ) n
    where c.assigned_user_id = incoming.user_id
      and length(n.digits) >= 10
      and (
        (length(source_digits) = 10 and
         (n.digits = source_digits or n.digits = '1' || source_digits))
        or
        (length(source_digits) > 10 and n.digits = source_digits)
      )
    limit 2
  ) candidate;

  update public.outreach_inbound_calls
    set crm_id = case when cardinality(matches) = 1 then matches[1] else null end,
        caller_match_status = case
          when cardinality(matches) = 1 then 'matched'
          when cardinality(matches) > 1 then 'ambiguous'
          else 'unknown' end,
        updated_at = now()
    where call_sid = p_call_sid;

  return query
    select case when cardinality(matches) = 1 then 'matched'
                when cardinality(matches) > 1 then 'ambiguous'
                else 'unknown' end::text,
           case when cardinality(matches) = 1 then matches[1] else null::uuid end;
end;
$$;

revoke all on function public.outreach_resolve_inbound_caller(text)
  from public, anon, authenticated;
grant execute on function public.outreach_resolve_inbound_caller(text) to service_role;

commit;
