begin;
alter table public.callcenter_transcripts
  add column if not exists interim_segments jsonb not null default '{}'::jsonb,
  add column if not exists transcription_final_sequences jsonb not null default '{}'::jsonb,
  add column if not exists transcript_revision bigint not null default 0;

create or replace function public.outreach_apply_transcription(p_call_sid text,p_event text,p_segment jsonb,p_error text)
returns void language plpgsql security definer set search_path='' as $$
declare saved public.callcenter_transcripts%rowtype; merged jsonb; plain text; role_key text; seq bigint; pending jsonb;
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
    role_key := coalesce(p_segment->>'speaker','unknown');
    seq := (p_segment->>'sequence')::bigint;
    pending := coalesce(saved.interim_segments,'{}'::jsonb);
    if p_segment->>'final'='false' then
      -- Revisions replace the pending text for this speaker; never append them
      -- to final history, and reject stale callbacks after a final or stop.
      if saved.transcription_status in ('stopped','error')
        or seq <= coalesce((saved.transcription_final_sequences->>role_key)::bigint,-1)
        or seq < coalesce((pending->role_key->>'sequence')::bigint,-1) then return; end if;
      update public.callcenter_transcripts
        set interim_segments=jsonb_set(pending,array[role_key],p_segment),
            transcript_revision=transcript_revision+1
        where id=saved.id;
      return;
    end if;
    p_segment := p_segment || jsonb_build_object('start_seconds',greatest(0,extract(epoch from coalesce((p_segment->>'timestamp')::timestamptz,now())-saved.started_at)));
    if not exists(select 1 from jsonb_array_elements(coalesce(saved.segments::jsonb,'[]'::jsonb)) e where e->>'id'=p_segment->>'id') then
      select jsonb_agg(e order by (e->>'sequence')::bigint),
        string_agg((case e->>'speaker' when 'agent' then 'You' when 'customer' then 'Prospect' else 'Transcript' end)||': '||(e->>'text'),E'\n' order by (e->>'sequence')::bigint)
        into merged,plain from jsonb_array_elements(coalesce(saved.segments::jsonb,'[]'::jsonb)||p_segment) e;
      update public.callcenter_transcripts set segments=merged,transcript=plain,
        interim_segments=case when coalesce((pending->role_key->>'sequence')::bigint,-1)<=seq
          then pending-role_key else pending end,
        transcription_final_sequences=jsonb_set(saved.transcription_final_sequences,array[role_key],
          to_jsonb(greatest(seq,coalesce((saved.transcription_final_sequences->>role_key)::bigint,-1)))),
        transcript_revision=transcript_revision+1 where id=saved.id;
    end if;
  elsif p_event='transcription-stopped' then
    update public.callcenter_transcripts set transcription_status='stopped',ended_at=now(),interim_segments='{}'::jsonb,transcript_revision=transcript_revision+1,
      duration_seconds=greatest(0,extract(epoch from now()-started_at)::integer) where id=saved.id;
  elsif p_event='transcription-error' then
    update public.callcenter_transcripts set transcription_status='error',transcription_error=p_error,interim_segments='{}'::jsonb,transcript_revision=transcript_revision+1 where id=saved.id;
  elsif p_event='transcription-started' and saved.transcription_status='starting' then
    update public.callcenter_transcripts set transcription_status='active',transcript_revision=transcript_revision+1 where id=saved.id;
  end if;
end $$;

-- Keep existing RLS and grants. Realtime only delivers rows the user can read.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables)
    and not exists(select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='callcenter_transcripts') then
    alter publication supabase_realtime add table public.callcenter_transcripts;
  end if;
end $$;
commit;
