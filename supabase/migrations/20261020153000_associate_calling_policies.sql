-- Run in the shared Supabase project before deploying either frontend.
begin;
create table if not exists public.associate_calling_policies (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null default 'normal' check(mode in ('normal','delayed','restricted')),
 delay_min int not null default 7 check(delay_min between 7 and 45),
 delay_max int not null default 45 check(delay_max between 7 and 45),
 slow_bias text not null default 'high' check(slow_bias in ('even','medium','high')),
 ready_after timestamptz,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 check(delay_max>=delay_min)
);
create table if not exists public.associate_calling_policy_audit (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 mode text not null,
 delay_min int not null,
 delay_max int not null,
 slow_bias text not null,
 created_at timestamptz not null default now()
);
create or replace function public.calling_policy_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.team_permissions where user_id=auth.uid() and role='ADMIN' and active=true);
$$;
revoke all on function public.calling_policy_is_admin() from public,anon,authenticated;
grant execute on function public.calling_policy_is_admin() to authenticated;
alter table public.associate_calling_policies enable row level security;
alter table public.associate_calling_policy_audit enable row level security;
revoke all on public.associate_calling_policies,public.associate_calling_policy_audit from public,anon,authenticated;
grant select on public.associate_calling_policies,public.associate_calling_policy_audit to authenticated;
grant all on public.associate_calling_policies,public.associate_calling_policy_audit to service_role;
drop policy if exists calling_policies_read on public.associate_calling_policies;
create policy calling_policies_read on public.associate_calling_policies for select to authenticated
 using (auth.uid()=user_id or (select public.calling_policy_is_admin()));
drop policy if exists calling_policy_audit_admin on public.associate_calling_policy_audit;
create policy calling_policy_audit_admin on public.associate_calling_policy_audit for select to authenticated
 using ((select public.calling_policy_is_admin()));
create or replace function public.admin_set_calling_policy(p_user_id uuid,p_mode text,p_min int default 7,p_max int default 45,p_bias text default 'high')
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.calling_policy_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_mode not in ('normal','delayed','restricted') or p_min not between 7 and 45 or p_max not between p_min and 45 or p_bias not in ('even','medium','high') then
  raise exception 'Invalid calling policy values'; end if;
 if not exists(select 1 from public.team_permissions where user_id=p_user_id and role='SALES') then
  raise exception 'Select a sales associate'; end if;
 insert into public.associate_calling_policies(user_id,mode,delay_min,delay_max,slow_bias,ready_after,updated_by,updated_at)
 values(p_user_id,p_mode,p_min,p_max,p_bias,null,auth.uid(),now())
 on conflict(user_id) do update set mode=excluded.mode,delay_min=excluded.delay_min,delay_max=excluded.delay_max,
 slow_bias=excluded.slow_bias,ready_after=null,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.associate_calling_policy_audit(user_id,actor_id,mode,delay_min,delay_max,slow_bias)
 values(p_user_id,auth.uid(),p_mode,p_min,p_max,p_bias);
end $$;
revoke all on function public.admin_set_calling_policy(uuid,text,int,int,text) from public,anon;
grant execute on function public.admin_set_calling_policy(uuid,text,int,int,text) to authenticated;
-- Every delayed call receives a freshly sampled delay with a long-delay bias.
create or replace function public.outreach_prepare_call()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.associate_calling_policies; frac double precision; seconds int;
begin
 if auth.uid() is null then raise exception 'Sign in to place calls' using errcode='42501';end if;
 select * into v from public.associate_calling_policies where user_id=auth.uid() for update;
 if not found or v.mode='normal' then return jsonb_build_object('mode','normal','delay_seconds',0);end if;
 if v.mode='restricted' then raise exception 'Outbound calling is restricted by your administrator.' using errcode='42501';end if;
 frac:=random();
 if v.slow_bias='high' then frac:=1-power(1-frac,3);
 elsif v.slow_bias='medium' then frac:=1-power(1-frac,1.6);end if;
 seconds:=v.delay_min+floor((v.delay_max-v.delay_min+1)*frac)::int;
 seconds:=least(seconds,v.delay_max);
 update public.associate_calling_policies set ready_after=now()+make_interval(secs=>seconds) where user_id=auth.uid();
 return jsonb_build_object('mode','delayed','delay_seconds',seconds);
end $$;
revoke all on function public.outreach_prepare_call() from public,anon;
grant execute on function public.outreach_prepare_call() to authenticated;
commit;
