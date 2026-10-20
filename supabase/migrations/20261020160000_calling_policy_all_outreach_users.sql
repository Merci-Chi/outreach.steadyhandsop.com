-- Extend Calling Controls to active admins and any Outreach-enabled account.
create or replace function public.admin_set_calling_policy(
  p_user_id uuid,p_mode text,p_min int default 7,p_max int default 45,p_bias text default 'high'
) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.calling_policy_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_mode not in ('normal','delayed','restricted') or p_min not between 7 and 45 or p_max not between p_min and 45 or p_bias not in ('even','medium','high') then
   raise exception 'Invalid calling policy values'; end if;
 if not exists (
   select 1 from public.team_permissions t
   join public.callcenter_profiles p on p.user_id=t.user_id
   where t.user_id=p_user_id and t.active=true and t.listed is distinct from false
   and (t.role in ('SALES','ADMIN') or t.sales_enabled=true)
   and p.disabled_at is null
 ) then raise exception 'Choose an active Outreach user'; end if;
 insert into public.associate_calling_policies(user_id,mode,delay_min,delay_max,slow_bias,ready_after,updated_by,updated_at)
 values(p_user_id,p_mode,p_min,p_max,p_bias,null,auth.uid(),now())
 on conflict(user_id) do update set mode=excluded.mode,delay_min=excluded.delay_min,delay_max=excluded.delay_max,
 slow_bias=excluded.slow_bias,ready_after=null,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.associate_calling_policy_audit(user_id,actor_id,mode,delay_min,delay_max,slow_bias)
 values(p_user_id,auth.uid(),p_mode,p_min,p_max,p_bias);
end $$;
revoke all on function public.admin_set_calling_policy(uuid,text,int,int,text) from public,anon;
grant execute on function public.admin_set_calling_policy(uuid,text,int,int,text) to authenticated;
