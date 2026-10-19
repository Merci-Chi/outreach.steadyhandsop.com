-- Permit an administrative CRM unassignment to preserve linked pipeline history.
-- Apply this migration before retrying the admin "Unassign Leads" action.
begin;

alter table public.sh_pipeline_records
  alter column salesperson_user_id drop not null;

-- The CRM assignment is the source of truth. Only an authenticated admin
-- (or a privileged database maintenance session) may change its owner.
create or replace function public.sh_pipeline_reassign_from_crm()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assigned_user_id is distinct from old.assigned_user_id then
    if not public.is_steadyhands_admin()
       and session_user <> 'postgres' then
      raise exception 'Only admins can reassign CRM leads';
    end if;

    update public.sh_pipeline_records
       set salesperson_user_id = new.assigned_user_id
     where crm_id = new.id::text;
  end if;
  return new;
end;
$$;

-- Preserve the existing stage validation and audit fields, but allow the
-- protected, nested CRM-to-pipeline owner sync. Direct owner edits still
-- require an authenticated admin.
create or replace function public.sh_pipeline_guard_and_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  active_owner uuid;
  synced_from_crm boolean := false;
begin
  if new.stage not in
     ('called','follow_up','portal_link_sent','account_created','reviewing_site','ready_to_buy') then
    raise exception 'Invalid pipeline stage: %', new.stage;
  end if;
  if new.stage <> 'follow_up' then new.follow_up_category := null; end if;
  if new.follow_up_category is not null
     and new.follow_up_category not in
       ('Interested','Unsure','Needs More Info','Not Now','Budget Concerns') then
    raise exception 'Invalid follow-up category';
  end if;

  if new.crm_id is not null then
    select assigned_user_id into active_owner
      from public.crm where id::text = new.crm_id;
    if active_owner is not null
       and active_owner is distinct from new.salesperson_user_id then
      raise exception 'Pipeline owner must match the CRM assignment';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- The CRM trigger executes at a nested trigger depth, after CRM ownership
    -- has already changed. Its new owner must match the CRM row exactly.
    synced_from_crm := pg_trigger_depth() > 1
      and new.crm_id is not distinct from old.crm_id
      and new.salesperson_user_id is distinct from old.salesperson_user_id
      and new.salesperson_user_id is not distinct from active_owner
      and new.company_name is not distinct from old.company_name
      and new.contact_name is not distinct from old.contact_name
      and new.phone is not distinct from old.phone;

    if not public.is_steadyhands_admin() and not synced_from_crm
      and (new.salesperson_user_id is distinct from old.salesperson_user_id
        or new.crm_id is distinct from old.crm_id
        or new.company_name is distinct from old.company_name
        or new.contact_name is distinct from old.contact_name
        or new.phone is distinct from old.phone) then
      raise exception 'Only admins can change pipeline identity or owner';
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.stage='called' and (tg_op='INSERT' or old.stage is distinct from new.stage) then
    new.contacted_at := coalesce(new.contacted_at,now());
  end if;
  if new.stage='portal_link_sent' and (tg_op='INSERT' or old.stage is distinct from new.stage) then
    new.portal_link_sent_at := coalesce(new.portal_link_sent_at,now());
  end if;
  if new.stage='account_created' and (tg_op='INSERT' or old.stage is distinct from new.stage) then
    new.account_created_at := coalesce(new.account_created_at,now());
  end if;
  if new.stage='reviewing_site' and (tg_op='INSERT' or old.stage is distinct from new.stage) then
    new.reviewing_site_at := coalesce(new.reviewing_site_at,now());
  end if;
  if new.stage='ready_to_buy' and (tg_op='INSERT' or old.stage is distinct from new.stage) then
    new.ready_to_buy_at := coalesce(new.ready_to_buy_at,now());
  end if;
  return new;
end;
$$;
commit;
