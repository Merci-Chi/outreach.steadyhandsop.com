-- Atomic per-owner activation. Existing RLS and the one-active-queue index remain in force.
create or replace function public.outreach_set_queue_active(p_queue_id uuid,p_active boolean)
returns public.outreach_queues
language plpgsql security invoker set search_path='' as $$
declare v_user uuid := auth.uid(); v_queue public.outreach_queues;
begin
 if v_user is null or p_active is null then
  raise exception 'Sign in and choose Active or Inactive.' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
 select * into v_queue from public.outreach_queues
 where id=p_queue_id and owner_id=v_user for update;
 if not found then raise exception 'Queue unavailable.' using errcode='42501'; end if;
 if p_active then
  update public.outreach_queues set is_active=false,updated_at=now()
  where owner_id=v_user and is_active and id<>p_queue_id;
 end if;
 update public.outreach_queues set is_active=p_active,updated_at=now()
 where id=p_queue_id and owner_id=v_user returning * into v_queue;
 if not found then raise exception 'Queue status could not be saved.' using errcode='42501'; end if;
 return v_queue;
end $$;
revoke all on function public.outreach_set_queue_active(uuid,boolean) from public,anon;
grant execute on function public.outreach_set_queue_active(uuid,boolean) to authenticated;
