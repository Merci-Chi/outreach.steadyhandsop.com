-- One-time deployment: completed requirements automatically release action-needed pauses.
-- This does not grant roles, enable disabled accounts, or clear other pause statuses.
begin;
create or replace function public.sh_get_my_access_pause()
returns table(is_paused boolean,status text,selected_track text)
language sql stable security definer set search_path='' as $$
  select coalesce(p.status='pause_action_needed',false),coalesce(p.status,'active'),p.selected_track
  from (select auth.uid() as uid) u
  left join public.sh_associate_pause p on p.user_id=u.uid
  where u.uid is not null;
$$;

create or replace function public.outreach_reconcile_completed_requirements(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  -- Read the durable assignment records, never browser metadata or a completion URL.
  if exists(select 1 from public.outreach_action_assignments
    where user_id=p_user_id and status='assigned') then return; end if;
  if exists(select 1 from public.sh_individual_agreement_actions
    where user_id=p_user_id and status='pending') then return; end if;
  -- A cleared/completed assignment is evidence that this is an action pause to release.
  -- An unexplained/manual action pause without any completed requirements stays intact.
  if not exists(select 1 from public.outreach_action_assignments
      where user_id=p_user_id and status in ('completed','cancelled'))
    and not exists(select 1 from public.sh_individual_agreement_actions
      where user_id=p_user_id and status in ('signed','acknowledged','cancelled')) then return; end if;
  update public.sh_associate_pause set status='active'
    where user_id=p_user_id and status='pause_action_needed';
end $$;
revoke all on function public.outreach_reconcile_completed_requirements(uuid) from public,anon,authenticated;

create or replace function public.outreach_requirement_completion_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare affected_user uuid;
begin
  affected_user := case when tg_op='DELETE' then old.user_id else new.user_id end;
  perform public.outreach_reconcile_completed_requirements(affected_user);
  if tg_op='UPDATE' and old.user_id is distinct from new.user_id then
    perform public.outreach_reconcile_completed_requirements(old.user_id);
  end if;
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    perform realtime.send('{}'::jsonb,'access-changed','outreach-access-'||affected_user::text,false);
  end if;
  return null;
end $$;
revoke all on function public.outreach_requirement_completion_changed() from public,anon,authenticated;
drop trigger if exists outreach_completion_sync on public.outreach_action_assignments;
create trigger outreach_completion_sync after insert or update or delete on public.outreach_action_assignments
for each row execute function public.outreach_requirement_completion_changed();
drop trigger if exists outreach_agreement_completion_sync on public.sh_individual_agreement_actions;
create trigger outreach_agreement_completion_sync after insert or update or delete on public.sh_individual_agreement_actions
for each row execute function public.outreach_requirement_completion_changed();

-- Repair stale action-needed flags for already-completed requirements, without touching pending ones.
do $$ declare u uuid; begin
  for u in select user_id from public.sh_associate_pause where status='pause_action_needed' loop
    perform public.outreach_reconcile_completed_requirements(u);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
