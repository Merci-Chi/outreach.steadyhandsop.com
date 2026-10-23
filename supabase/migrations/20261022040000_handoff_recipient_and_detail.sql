-- Additional SQL needed for safe handoff lead opening and recipient names.
-- REVIEW and run manually after 20261022030000_lead_handoff_queue.sql.
begin;
create or replace function public.outreach_handoff_detail(p_handoff_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); h public.outreach_lead_handoffs%rowtype; c public.crm%rowtype;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into h from public.outreach_lead_handoffs where id=p_handoff_id
 and (sender_id=v_user or recipient_id=v_user);
 if not found then raise exception 'Handoff not available' using errcode='42501'; end if;
 select * into c from public.crm where id=h.crm_id;
 if not found then raise exception 'Lead unavailable'; end if;
 return jsonb_build_object('handoff_id',h.id,'kind',h.kind,'status',h.status,
 'lead_id',c.id,'company',c.company,'contact',c.name,'phone',c.phone,
 'email',c.email,'notes',c.notes,'handoff_notes',h.notes);
end $$;
create or replace function public.outreach_handoff_eligible_recipients(p_kind text)
returns table(user_id uuid,display_name text)
language sql stable security definer set search_path='' as $$
select r.user_id,coalesce(nullif(split_part(u.email,'@',1),''),'Associate')
from public.outreach_handoff_recipients r
join auth.users u on u.id=r.user_id
join public.team_permissions p on p.user_id=r.user_id and p.active=true
where auth.uid() is not null and r.kind=p_kind and r.active
and r.user_id<>auth.uid()
order by 2;
$$;
revoke all on function public.outreach_handoff_detail(uuid) from public,anon,authenticated;
revoke all on function public.outreach_handoff_eligible_recipients(text) from public,anon,authenticated;
grant execute on function public.outreach_handoff_detail(uuid) to authenticated;
grant execute on function public.outreach_handoff_eligible_recipients(text) to authenticated;
commit;
