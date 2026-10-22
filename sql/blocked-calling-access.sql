-- Apply once to the shared database before deploying Admin and Outreach.
begin;
create or replace function public.outreach_access_status(p_user_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_legacy jsonb;
  v_pending boolean;
  v_calling_blocked boolean;
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
  select exists(select 1 from public.associate_calling_policies
    where user_id=p_user_id and mode='restricted') into v_calling_blocked;
  return jsonb_build_object(
    'calling_blocked',v_calling_blocked,
    'is_paused',v_calling_blocked or v_pending or (v_legacy->>'is_paused')::boolean,
    'action_required',v_pending,
    'agreement_action_required',(v_legacy->>'is_paused')::boolean
  );
end $$;
revoke all on function public.outreach_access_status(uuid) from public,anon;
grant execute on function public.outreach_access_status(uuid) to authenticated,service_role;


-- Apply the same block to alternate lead surfaces, including saved contact details.
do $$
declare t text;
begin
  foreach t in array array['callcenter-leads','callcenter_scheduled_calls',
    'callcenter_scheduled_reminders','outreach_inbound_calls','outreach_tasks',
    'sh_pipeline_records','sh_pipeline_history','outreach_lead_stars',
    'callcenter_call_feedback','callcenter_post_call_questionnaires'] loop
    if to_regclass(format('public.%I',t)) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists outreach_calling_block on public.%I',t);
      execute format('create policy outreach_calling_block on public.%I as restrictive for all to authenticated using (not exists (select 1 from public.associate_calling_policies where user_id=(select auth.uid()) and mode=''restricted'')) with check (not exists (select 1 from public.associate_calling_policies where user_id=(select auth.uid()) and mode=''restricted''))',t);
    end if;
  end loop;
end $$;

-- These existing definer RPCs bypass RLS. Add a guard while preserving their
-- live signatures, query logic, ownership and grants. Abort on unexpected bodies.
do $migration$
declare f record; definition text;
begin
  for f in select p.oid,p.prosrc from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and l.lanname='plpgsql'
      and p.proname in ('my_assigned_leads_v1','callcenter_claim_lead',
        'sh_start_sale','sh_save_pipeline_stage','set_outreach_process_check',
        'record_regular_outreach_call_v1')
  loop
    if position('-- calling-block-guard' in f.prosrc)>0 then continue; end if;
    if f.prosrc !~* '\mBEGIN\M' then raise exception 'Unexpected RPC body: %',f.oid::regprocedure; end if;
    definition:=pg_get_functiondef(f.oid);
    definition:=regexp_replace(definition,'\mBEGIN\M', $guard$BEGIN
      -- calling-block-guard
      IF EXISTS (SELECT 1 FROM public.associate_calling_policies
                 WHERE user_id=auth.uid() AND mode='restricted') THEN
        RAISE EXCEPTION 'Your calling and lead access are temporarily paused. Please contact your team administrator for help.' USING ERRCODE='42501';
      END IF;$guard$,'i');
    execute definition;
  end loop;
end $migration$;

drop trigger if exists outreach_calling_access_changed on public.associate_calling_policies;
create trigger outreach_calling_access_changed after insert or update or delete on public.associate_calling_policies
for each row execute function public.outreach_notify_access_changed();
notify pgrst,'reload schema';
commit;
