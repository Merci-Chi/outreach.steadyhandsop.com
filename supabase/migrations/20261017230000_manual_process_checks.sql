-- Run in the Supabase SQL Editor before deploying the matching page change.
-- No existing CRM stages, tags, notes, or development handoffs are changed.
-- No browser-stored or inferred checkbox values are imported.
begin;

-- Match crm.id's actual type (UUID, bigint, etc.) rather than guessing it.
do $migration$
declare
  crm_id_type text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into strict crm_id_type
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.crm'::regclass
     and a.attname = 'id' and not a.attisdropped;

  execute format($ddl$
    create table if not exists public.outreach_process_checks (
      crm_id %s not null references public.crm(id) on delete cascade,
      step_no smallint not null check (step_no between 1 and 6),
      is_checked boolean not null default false,
      changed_by uuid references auth.users(id) on delete set null,
      changed_at timestamptz not null default now(),
      version bigint not null default 0 check (version >= 0),
      constraint outreach_process_checks_pkey primary key (crm_id, step_no)
    )
  $ddl$, crm_id_type);

  execute format($ddl$
    create table if not exists public.outreach_process_check_events (
      event_id bigint generated always as identity primary key,
      crm_id %s not null references public.crm(id) on delete cascade,
      step_no smallint not null check (step_no between 1 and 6),
      was_checked boolean not null,
      is_checked boolean not null,
      changed_by uuid references auth.users(id) on delete set null,
      changed_at timestamptz not null default now(),
      version bigint not null,
      source text not null default 'manual_checkbox'
        check (source = 'manual_checkbox')
    )
  $ddl$, crm_id_type);
end
$migration$;

create index if not exists outreach_process_check_events_lead_idx
  on public.outreach_process_check_events (crm_id, changed_at desc, event_id desc);

alter table public.outreach_process_checks enable row level security;
alter table public.outreach_process_check_events enable row level security;

revoke all on public.outreach_process_checks, public.outreach_process_check_events
  from public, anon, authenticated;
grant select on public.outreach_process_checks, public.outreach_process_check_events
  to authenticated;
grant all on public.outreach_process_checks, public.outreach_process_check_events
  to service_role;
grant usage, select on sequence public.outreach_process_check_events_event_id_seq
  to service_role;

drop policy if exists process_checks_read_assigned on public.outreach_process_checks;
create policy process_checks_read_assigned on public.outreach_process_checks
  for select to authenticated using (
    exists (select 1 from public.crm c
             where c.id = outreach_process_checks.crm_id
               and c.assigned_user_id::text = auth.uid()::text)
  );

drop policy if exists process_events_read_assigned on public.outreach_process_check_events;
create policy process_events_read_assigned on public.outreach_process_check_events
  for select to authenticated using (
    exists (select 1 from public.crm c
             where c.id = outreach_process_check_events.crm_id
               and c.assigned_user_id::text = auth.uid()::text)
  );

-- This RPC is called ONLY by a manual checkbox change, never status polling,
-- Next/Previous, development handoff, tag updates, or phone/notes edits.
create or replace function public.set_outreach_process_check(
  p_crm_id text,
  p_step_no integer,
  p_is_checked boolean,
  p_expected_version bigint
)
returns setof public.outreach_process_checks
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor uuid := auth.uid();
  lead public.crm%rowtype;
  saved public.outreach_process_checks%rowtype;
  previous_checked boolean;
  previous_version bigint;
begin
  if actor is null then
    raise exception 'Sign in before updating the checklist.' using errcode = '42501';
  end if;
  if p_step_no is null or p_step_no not between 1 and 6
     or p_is_checked is null or p_expected_version is null
     or p_expected_version < 0 then
    raise exception 'Invalid process checkbox request.' using errcode = '22023';
  end if;

  -- Lock the CRM row so reassignment and concurrent checkbox changes serialize.
  select c.* into lead from public.crm c
   where c.id::text = p_crm_id for update;
  if not found or lead.assigned_user_id::text is distinct from actor::text then
    raise exception 'This prospect is not assigned to your account.' using errcode = '42501';
  end if;

  select c.is_checked, c.version into previous_checked, previous_version
    from public.outreach_process_checks c
   where c.crm_id = lead.id and c.step_no = p_step_no;
  previous_checked := coalesce(previous_checked, false);
  previous_version := coalesce(previous_version, 0);
  if previous_version <> p_expected_version then
    raise exception 'Checklist changed in another window. Refresh and check again.'
      using errcode = '40001';
  end if;

  insert into public.outreach_process_checks
    (crm_id, step_no, is_checked, changed_by, changed_at, version)
  values
    (lead.id, p_step_no, p_is_checked, actor, clock_timestamp(), previous_version + 1)
  on conflict on constraint outreach_process_checks_pkey do update
    set is_checked = excluded.is_checked,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at,
        version = excluded.version
  returning * into saved;

  insert into public.outreach_process_check_events
    (crm_id, step_no, was_checked, is_checked, changed_by, changed_at, version)
  values
    (lead.id, p_step_no, previous_checked, p_is_checked, actor,
     saved.changed_at, saved.version);

  return next saved;
end
$function$;

revoke all on function public.set_outreach_process_check(text, integer, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.set_outreach_process_check(text, integer, boolean, bigint)
  to authenticated;

-- Missing step rows mean unchecked. Do not seed checks from CRM tags/stages.
-- Audit query for administrators:
-- select * from public.outreach_process_check_events
-- order by changed_at desc, event_id desc;
notify pgrst, 'reload schema';
commit;
