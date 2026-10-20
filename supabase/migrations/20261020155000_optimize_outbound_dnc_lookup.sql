-- Production DNC lookup optimization, applied 2026-10-20.
-- Keep DNC enforcement, but use an indexed normalized number lookup rather than
-- scanning every CRM row with OR expressions and nonindexed functions.
create index if not exists crm_dnc_phone_normalized_idx
  on public.crm (crm_dnc_private.normalize_phone(phone))
  where phone is not null;

create or replace function public.outreach_call_is_blocked(
  p_phone text, p_crm_id text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare
  normalized_phone text := crm_dnc_private.normalize_phone(p_phone);
  lead_id uuid;
begin
  if nullif(trim(p_phone),'') is null then return true; end if;
  if exists(select 1 from crm_dnc_private.suppressed_phones d
            where d.phone=normalized_phone) then return true; end if;
  if p_crm_id is not null and p_crm_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    lead_id := p_crm_id::uuid;
    if exists(select 1 from public.crm c where c.id=lead_id
              and crm_dnc_private.is_dnc_record(to_jsonb(c))) then return true; end if;
  end if;
  if normalized_phone is not null and exists(
    select 1 from public.crm c
    where c.phone is not null
      and crm_dnc_private.normalize_phone(c.phone)=normalized_phone
      and crm_dnc_private.is_dnc_record(to_jsonb(c))
  ) then return true; end if;
  return false;
end $fn$;
