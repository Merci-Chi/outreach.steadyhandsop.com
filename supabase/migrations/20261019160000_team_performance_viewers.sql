-- Apply once to the shared Supabase project before deploying either frontend.
-- A separate entitlement: not equivalent to administrator access.
begin;
create table if not exists public.team_performance_viewers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_by uuid references auth.users(id) on delete set null,
 granted_at timestamptz not null default now()
);
alter table public.team_performance_viewers enable row level security;
revoke all on public.team_performance_viewers from public, anon, authenticated;
grant all on public.team_performance_viewers to service_role;

create or replace function public.team_performance_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (select 1 from public.team_permissions p
  where p.user_id = auth.uid() and p.role = 'ADMIN' and p.active = true);
$$;
revoke all on function public.team_performance_is_admin() from public, anon;
grant execute on function public.team_performance_is_admin() to authenticated;

create or replace function public.team_performance_access(p_user_id uuid default null)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare target uuid := coalesce(p_user_id, auth.uid());
begin
 if auth.uid() is null then return false; end if;
 if target <> auth.uid() and not public.team_performance_is_admin() then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 return public.team_performance_is_admin() and target=auth.uid()
   or exists (
      select 1 from public.team_performance_viewers v
      join public.team_permissions p on p.user_id=v.user_id and p.active=true
      join public.callcenter_profiles cp on cp.user_id=v.user_id and cp.disabled_at is null
      where v.user_id=target
   );
end;
$$;
revoke all on function public.team_performance_access(uuid) from public, anon;
grant execute on function public.team_performance_access(uuid) to authenticated;

create or replace function public.team_performance_set_access(p_user_id uuid, p_allowed boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if not public.team_performance_is_admin() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if not exists(select 1 from public.team_permissions p where p.user_id=p_user_id) then
  raise exception 'Unknown user';
 end if;
 if p_allowed then
  insert into public.team_performance_viewers(user_id,granted_by)
  values (p_user_id,auth.uid())
  on conflict(user_id) do update set granted_by=excluded.granted_by,granted_at=now();
 else
  delete from public.team_performance_viewers where user_id=p_user_id;
 end if;
 return true;
end;
$$;
revoke all on function public.team_performance_set_access(uuid,boolean) from public,anon;
grant execute on function public.team_performance_set_access(uuid,boolean) to authenticated;

-- Read-only aggregated reporting; never exposes unrestricted call rows,
-- customer PII or table SELECT privileges to ordinary associates.
create or replace function public.team_performance_report()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare report jsonb;
begin
 if not public.team_performance_access() then
  raise exception 'Team performance access required' using errcode='42501';
 end if;
 with active_associates as (
  select p.user_id, coalesce(nullif(cp.display_name,''),nullif(cp.email,''),'Associate') as name
  from public.team_permissions p join public.callcenter_profiles cp on cp.user_id=p.user_id
  where (p.role='SALES' or p.sales_enabled=true)
    and p.listed is distinct from false
 ),
 call_rows as (
  select c.user_id,c.duration_seconds,c.outcome,c.created_at
  from public.callcenter_call_activity c
  where c.created_at >= (current_date - interval '6 days')
    and c.created_at < (current_date + interval '1 day')
    and coalesce(c.outcome,'') !~* 'didn.t call'
 ),
 stats as (
  select a.user_id,a.name,
   count(c.user_id) as calls,
   count(c.user_id) filter(where c.outcome ~* '(interested|follow.?up|call.?back|requested (text|email)|sale|sold|closed)' and c.outcome !~* 'not interested') as positive,
   coalesce(round(avg(greatest(0,coalesce(c.duration_seconds,0))))::integer,0) as avg_seconds
  from active_associates a left join call_rows c on c.user_id=a.user_id
  group by a.user_id,a.name
 )
 select jsonb_build_object(
  'period','Last 7 calendar days',
  'associates',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'name',name,'calls',calls,'positive',positive,'avg_seconds',avg_seconds) order by name) from stats),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day::date,'calls',(select count(*) from call_rows c where c.created_at::date=day::date)) order by day)
    from generate_series(current_date - 6,current_date,interval '1 day') day),'[]'::jsonb)
 ) into report;
 return report;
end;
$$;
revoke all on function public.team_performance_report() from public,anon;
grant execute on function public.team_performance_report() to authenticated;
commit;