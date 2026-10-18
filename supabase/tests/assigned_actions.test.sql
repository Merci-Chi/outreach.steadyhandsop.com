-- Local Supabase/pgTAP only. All fixtures and changes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','assigned-action-test@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','unassigned-action-test@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','other-action-test@example.invalid');
insert into public.outreach_associates(user_id,current_basis,start_date) values
 ('10000000-0000-4000-8000-000000000001','hourly',date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+7),
 ('10000000-0000-4000-8000-000000000002','commission',null),
 ('10000000-0000-4000-8000-000000000003','commission',null);
insert into public.outreach_action_assignments(id,user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.outreach_action_assignments),0,'Unassigned user sees no assignments');
select throws_like($q$select public.outreach_action_submit(
 '20000000-0000-4000-8000-000000000001','commission','America/Chicago','America/Chicago',540,10,false,null)
$q$,'%not assigned%','Another user cannot submit an assigned action');
select throws_like($q$select public.outreach_admin_assign_action(
 '10000000-0000-4000-8000-000000000002','commission',null)
$q$,'%administrator access required%','Associate cannot assign an action');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.outreach_action_assignments),1,'Assigned user sees only own assignment');
select is((select count(*)::integer from public.outreach_associates),1,'Assigned user sees only own associate record');
select throws_like($q$update public.outreach_action_assignments set status='cancelled'$q$,'%permission denied%','Associate cannot directly change assignments');
select throws_like($q$update public.outreach_associates set current_basis='commission'$q$,'%permission denied%','Associate cannot change their actual agreement');
select throws_like(format($q$select public.outreach_action_extend_start_date(
 '20000000-0000-4000-8000-000000000001',%L::date,%L::date)
$q$,date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+7,
 date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+12),
 '%Monday through Friday%','Weekend extension rejected');
select throws_like(format($q$select public.outreach_action_extend_start_date(
 '20000000-0000-4000-8000-000000000001',%L::date,%L::date)
$q$,date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+7,
 date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+7),
 '%later start date%','Same or earlier start date rejected');
select lives_ok(format($q$select public.outreach_action_extend_start_date(
 '20000000-0000-4000-8000-000000000001',%L::date,%L::date)
$q$,date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+7,
 date_trunc('week',current_timestamp at time zone 'America/Los_Angeles')::date+14),
 'Later weekday extension succeeds');
select is((select count(*)::integer from public.outreach_start_date_history),1,'Confirmed extension is audited');
select throws_like($q$select public.outreach_action_submit(
 '20000000-0000-4000-8000-000000000001','hourly','America/Chicago','America/Chicago',540,10,false,
 (select start_date from public.outreach_associates))
$q$,'%Acknowledge%','Hourly submission needs quota acknowledgment');
select lives_ok($q$select public.outreach_action_submit(
 '20000000-0000-4000-8000-000000000001','hourly','America/Chicago','America/Chicago',540,10,true,
 (select start_date from public.outreach_associates))
$q$,'Valid hourly questionnaire submits');
select is((select status from public.outreach_action_assignments),'completed','Submission completes the assignment atomically');
select throws_like($q$select public.outreach_action_submit(
 '20000000-0000-4000-8000-000000000001','hourly','America/Chicago','America/Chicago',540,10,true,
 (select start_date from public.outreach_associates))
$q$,'%already closed%','Completed assignment rejects a second submission');
reset role;
set local role anon;
select throws_like($q$select * from public.outreach_action_assignments$q$,'%permission denied%','Signed-out callers cannot read assignments');
reset role;
select * from finish();
rollback;
