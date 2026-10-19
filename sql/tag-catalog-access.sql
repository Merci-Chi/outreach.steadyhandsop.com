-- All signed-in Outreach users can choose tags and use catalog filters.
-- Catalog writes remain managed by existing CRM synchronization triggers.
begin;
alter table public.crm_filter_catalog enable row level security;
grant select on public.crm_filter_catalog to authenticated;
drop policy if exists outreach_catalog_read on public.crm_filter_catalog;
create policy outreach_catalog_read on public.crm_filter_catalog
  for select to authenticated using ((select auth.uid()) is not null);
notify pgrst, 'reload schema';
commit;

-- Assigned users must have a permissive UPDATE policy as well as the existing
-- restrictive assignment/account guards. Dashboard view access is not required.
begin;
drop policy if exists outreach_assigned_lead_update on public.crm;
create policy outreach_assigned_lead_update on public.crm
for update to authenticated
using (
  assigned_user_id = (select auth.uid()) and not coalesce(admin_archived,false)
  and exists (select 1 from public.team_permissions p where p.user_id=(select auth.uid()) and p.active)
)
with check (
  assigned_user_id = (select auth.uid()) and not coalesce(admin_archived,false)
  and exists (select 1 from public.team_permissions p where p.user_id=(select auth.uid()) and p.active)
);
notify pgrst, 'reload schema';
commit;
