-- Apply after 20261018230000_questionnaire_multiple_actions.sql.
-- Reuse the existing live agreement/account access check; never clear a manual pause.
begin;
create or replace function public.outreach_access_status(p_user_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_legacy jsonb;
  v_pending boolean;
  v_sub text := current_setting('request.jwt.claim.sub',true);
  v_claims text := current_setting('request.jwt.claims',true);
begin
  if p_user_id is null or (p_user_id is distinct from auth.uid() and coalesce(auth.role(),'') <> 'service_role') then
    raise exception 'Sign in to check your own access.' using errcode='42501';
  end if;
  -- Service-only cross-user checks are needed by signed Twilio webhooks.
  -- Scope the legacy auth.uid()-based RPC to this user, restoring claims afterward.
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id,'role','authenticated')::text,true);
  select to_jsonb(s) into v_legacy from (select * from public.sh_get_my_access_pause()) s;
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  if v_legacy is null or jsonb_typeof(v_legacy->'is_paused') is distinct from 'boolean' then
    raise exception 'Account access could not be verified.';
  end if;
  select exists(select 1 from public.outreach_action_assignments
    where user_id=p_user_id and status='assigned') into v_pending;
  return jsonb_build_object(
    'is_paused',v_pending or (v_legacy->>'is_paused')::boolean,
    'action_required',v_pending,
    'agreement_action_required',(v_legacy->>'is_paused')::boolean
  );
end $$;
revoke all on function public.outreach_access_status(uuid) from public,anon;
grant execute on function public.outreach_access_status(uuid) to authenticated,service_role;

-- Restrictive policies intersect existing ownership/role policies; they grant no access.
-- Questionnaire, login and admin configuration tables stay available to resolve actions.
do $$
declare t text;
begin
  foreach t in array array['crm','callcenter_call_activity','callcenter_transcripts','outreach_queues','outreach_queue_items'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists outreach_required_actions on public.%I',t);
      execute format('create policy outreach_required_actions on public.%I as restrictive for all to authenticated using (not ((select public.outreach_access_status())->>''is_paused'')::boolean) with check (not ((select public.outreach_access_status())->>''is_paused'')::boolean)',t);
    end if;
  end loop;
end $$;

-- Assignment completion emits only an invalidation signal, never questionnaire data.
create or replace function public.outreach_notify_access_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    perform realtime.send('{}'::jsonb,'access-changed','outreach-access-'||coalesce(new.user_id,old.user_id)::text,false);
  end if;
  return null;
end $$;
revoke all on function public.outreach_notify_access_changed() from public,anon,authenticated;
drop trigger if exists outreach_access_changed on public.outreach_action_assignments;
create trigger outreach_access_changed after insert or update or delete on public.outreach_action_assignments
for each row execute function public.outreach_notify_access_changed();
notify pgrst,'reload schema';
commit;
