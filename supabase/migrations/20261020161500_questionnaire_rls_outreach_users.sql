-- Applied to production 2026-10-20. Allow active Outreach-enabled users
-- to save only their own call results with matching call activity and CRM ID.
begin;
drop policy if exists "Salespeople insert own questionnaires" on public.callcenter_post_call_questionnaires;
create policy "Salespeople insert own questionnaires" on public.callcenter_post_call_questionnaires for insert to authenticated
with check (user_id=(select auth.uid()) and exists (
 select 1 from public.team_permissions tp join public.callcenter_profiles cp on cp.user_id=tp.user_id
 where tp.user_id=(select auth.uid()) and tp.active=true and tp.listed is distinct from false
 and cp.disabled_at is null and (tp.role in ('ADMIN','SALES') or tp.sales_enabled=true)
) and exists (
 select 1 from public.callcenter_call_activity a
 where a.id=call_activity_id and a.user_id=(select auth.uid()) and a.crm_id=crm_id
));
drop policy if exists "Salespeople update own questionnaires" on public.callcenter_post_call_questionnaires;
create policy "Salespeople update own questionnaires" on public.callcenter_post_call_questionnaires for update to authenticated
using (user_id=(select auth.uid()) and exists (
 select 1 from public.team_permissions tp join public.callcenter_profiles cp on cp.user_id=tp.user_id
 where tp.user_id=(select auth.uid()) and tp.active=true and tp.listed is distinct from false
 and cp.disabled_at is null and (tp.role in ('ADMIN','SALES') or tp.sales_enabled=true)
))
with check (user_id=(select auth.uid()) and exists (
 select 1 from public.callcenter_call_activity a
 where a.id=call_activity_id and a.user_id=(select auth.uid()) and a.crm_id=crm_id
));
commit;
