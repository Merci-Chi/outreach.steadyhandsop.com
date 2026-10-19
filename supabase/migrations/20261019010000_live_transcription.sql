begin;
alter table public.callcenter_call_activity add column if not exists call_sid text;
-- Preserve the installed CRM and activity ID types on existing projects.
do $$
declare crm_type text; activity_type text;
begin
  select format_type(atttypid,atttypmod) into strict crm_type from pg_attribute
    where attrelid='public.crm'::regclass and attname='id' and not attisdropped;
  select format_type(atttypid,atttypmod) into strict activity_type from pg_attribute
    where attrelid='public.callcenter_call_activity'::regclass and attname='id' and not attisdropped;
  execute format($ddl$create table if not exists public.callcenter_transcripts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id), crm_id %s references public.crm(id),
    call_activity_id %s references public.callcenter_call_activity(id),
    company text, contact text, phone text, started_at timestamptz not null default now(),
    ended_at timestamptz, duration_seconds integer default 0, transcript text default '',
    segments jsonb default '[]'::jsonb, outcome text default '', created_at timestamptz default now()
  )$ddl$,crm_type,activity_type);
end $$;
alter table public.callcenter_transcripts
  add column if not exists call_sid text,
  add column if not exists transcription_status text not null default 'starting',
  add column if not exists transcription_error text;
create unique index if not exists callcenter_transcripts_call_sid_idx on public.callcenter_transcripts(call_sid);
alter table public.callcenter_transcripts enable row level security;
create policy outreach_transcripts_read_own on public.callcenter_transcripts for select to authenticated using (user_id=auth.uid());
grant select on public.callcenter_transcripts to authenticated;
revoke insert,update,delete on public.callcenter_transcripts from public,anon,authenticated;
grant all on public.callcenter_transcripts to service_role;

-- Only the signed outbound webhook may establish call ownership. Do not infer it
-- from a friendly transcription name or browser-supplied user ID.
create or replace function public.outreach_start_transcript(p_call_sid text,p_user_id uuid,p_crm_id text)
returns void language plpgsql security definer set search_path='' as $$
declare lead public.crm%rowtype;
begin
  if p_call_sid is null or p_call_sid !~ '^CA[0-9a-fA-F]{32}$' then raise exception 'Invalid call SID'; end if;
  select * into strict lead from public.crm where id::text=p_crm_id and assigned_user_id=p_user_id;
  insert into public.callcenter_transcripts(user_id,crm_id,call_sid,company)
    values(p_user_id,lead.id,p_call_sid,to_jsonb(lead)->>'company')
    on conflict(call_sid) do nothing;
  if not exists(select 1 from public.callcenter_transcripts where call_sid=p_call_sid and user_id=p_user_id and crm_id=lead.id) then
    raise exception 'Call ownership mismatch';
  end if;
end $$;

create or replace function public.outreach_apply_transcription(p_call_sid text,p_event text,p_segment jsonb,p_error text)
returns void language plpgsql security definer set search_path='' as $$
declare saved public.callcenter_transcripts%rowtype; merged jsonb; plain text;
begin
  -- Row lock prevents concurrent track callbacks from overwriting one another.
  select * into strict saved from public.callcenter_transcripts where call_sid=p_call_sid for update;
  if p_event='transcription-content' and p_segment is not null then
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
revoke all on function public.outreach_start_transcript(text,uuid,text) from public,anon,authenticated;
revoke all on function public.outreach_apply_transcription(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.outreach_start_transcript(text,uuid,text) to service_role;
grant execute on function public.outreach_apply_transcription(text,text,jsonb,text) to service_role;

-- Activity may arrive before or after the last transcription callback.
create or replace function public.outreach_link_transcript_activity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.callcenter_transcripts set call_activity_id=new.id,outcome=new.outcome
    where call_sid=new.call_sid and user_id=new.user_id;
  return new;
end $$;
create trigger outreach_link_transcript_activity after insert or update of call_sid,outcome on public.callcenter_call_activity
  for each row execute function public.outreach_link_transcript_activity();
commit;
