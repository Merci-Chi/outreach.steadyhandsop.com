-- Batch 3: bind new and existing inbound transcript rows to the verified call owner.
-- Run AFTER Batch 1. Does not retroactively reassign historical transcripts.
begin;
create or replace function public.outreach_start_inbound_transcript(p_call_sid text)
returns void language plpgsql security definer set search_path='' as $$
declare incoming public.outreach_inbound_calls%rowtype;
declare linked public.crm%rowtype;
declare saved public.callcenter_transcripts%rowtype;
begin
  if p_call_sid is null or p_call_sid !~ '^CA[0-9a-fA-F]{32}$' then raise exception 'Invalid call SID'; end if;
  select * into strict incoming from public.outreach_inbound_calls where call_sid=p_call_sid for update;
  if incoming.user_id is null or incoming.route_destination is distinct from 'app' then
    raise exception 'An assigned app route is required';
  end if;
  if incoming.caller_match_status='matched' and incoming.crm_id is not null then
    select * into linked from public.crm
      where id=incoming.crm_id and assigned_user_id=incoming.user_id;
    if not found then raise exception 'Caller assignment mismatch'; end if;
  end if;
  insert into public.callcenter_transcripts
    (user_id,call_sid,phone,company,contact,crm_id,call_direction)
  values (incoming.user_id,p_call_sid,incoming.from_number,
    case when linked.id is not null then coalesce(nullif(linked.company,''),'Incoming call') else 'Incoming call' end,
    case when linked.id is not null then coalesce(linked.name,'') else '' end,
    linked.id,'inbound')
  on conflict(call_sid) do nothing;
  select * into strict saved from public.callcenter_transcripts where call_sid=p_call_sid for update;
  if saved.user_id is distinct from incoming.user_id or saved.call_direction <> 'inbound' then
    raise exception 'Call ownership mismatch';
  end if;
  if saved.crm_id is not null and saved.crm_id is distinct from linked.id then
    raise exception 'Existing transcript CRM mismatch';
  end if;
  if saved.crm_id is null and linked.id is not null then
    update public.callcenter_transcripts
      set crm_id=linked.id,company=coalesce(nullif(linked.company,''),'Incoming call'),
          contact=coalesce(linked.name,'')
      where id=saved.id and crm_id is null;
  end if;
end $$;
revoke all on function public.outreach_start_inbound_transcript(text) from public,anon,authenticated;
grant execute on function public.outreach_start_inbound_transcript(text) to service_role;
commit;
