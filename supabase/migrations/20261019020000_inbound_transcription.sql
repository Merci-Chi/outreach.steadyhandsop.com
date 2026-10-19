begin;
alter table public.callcenter_transcripts
  add column if not exists call_direction text not null default 'outbound';

-- Ownership comes exclusively from the signed inbound router's saved record.
-- Unknown callers remain unlinked to CRM rather than guessing a selected lead.
create or replace function public.outreach_start_inbound_transcript(p_call_sid text)
returns void language plpgsql security definer set search_path='' as $$
declare incoming public.outreach_inbound_calls%rowtype;
begin
  if p_call_sid is null or p_call_sid !~ '^CA[0-9a-fA-F]{32}$' then raise exception 'Invalid call SID'; end if;
  select * into strict incoming from public.outreach_inbound_calls where call_sid=p_call_sid;
  if incoming.user_id is null or incoming.route_destination is distinct from 'app' then
    raise exception 'An assigned app route is required';
  end if;
  insert into public.callcenter_transcripts(user_id,call_sid,phone,company,call_direction)
    values(incoming.user_id,p_call_sid,incoming.from_number,'Incoming call','inbound')
    on conflict(call_sid) do nothing;
  if not exists(select 1 from public.callcenter_transcripts
    where call_sid=p_call_sid and user_id=incoming.user_id and call_direction='inbound') then
    raise exception 'Call ownership mismatch';
  end if;
end $$;
revoke all on function public.outreach_start_inbound_transcript(text) from public,anon,authenticated;
grant execute on function public.outreach_start_inbound_transcript(text) to service_role;

create or replace function public.outreach_apply_transcription(p_call_sid text,p_event text,p_segment jsonb,p_error text)
returns void language plpgsql security definer set search_path='' as $$
declare saved public.callcenter_transcripts%rowtype; merged jsonb; plain text;
begin
  -- Row lock prevents concurrent track callbacks from overwriting one another.
  select * into strict saved from public.callcenter_transcripts where call_sid=p_call_sid for update;
  if p_event='transcription-content' and p_segment is not null then
    -- Callback mapping defaults to the outbound browser parent. On an incoming
    -- PSTN parent, inbound audio is the customer and outbound audio is the agent.
    if saved.call_direction='inbound' then
      p_segment := p_segment || jsonb_build_object('speaker',case p_segment->>'speaker'
        when 'agent' then 'customer' when 'customer' then 'agent' else 'unknown' end);
    end if;
    p_segment := p_segment || jsonb_build_object('start_seconds',greatest(0,extract(epoch from coalesce((p_segment->>'timestamp')::timestamptz,now())-saved.started_at)));
    if not exists(select 1 from jsonb_array_elements(coalesce(saved.segments::jsonb,'[]'::jsonb)) e where e->>'id'=p_segment->>'id') then
      select jsonb_agg(e order by (e->>'sequence')::bigint),
        string_agg((case e->>'speaker' when 'agent' then 'You' when 'customer' then 'Prospect' else 'Transcript' end)||': '||(e->>'text'),E'\n' order by (e->>'sequence')::bigint)
        into merged,plain from jsonb_array_elements(coalesce(saved.segments::jsonb,'[]'::jsonb)||p_segment) e;
      update public.callcenter_transcripts set segments=merged,transcript=plain where id=saved.id;
    end if;
  elsif p_event='transcription-stopped' then
    update public.callcenter_transcripts set transcription_status='stopped',ended_at=now(),
      duration_seconds=greatest(0,extract(epoch from now()-started_at)::integer) where id=saved.id;
  elsif p_event='transcription-error' then
    update public.callcenter_transcripts set transcription_status='error',transcription_error=p_error where id=saved.id;
  elsif p_event='transcription-started' and saved.transcription_status='starting' then
    update public.callcenter_transcripts set transcription_status='active' where id=saved.id;
  end if;
end $$;

commit;
