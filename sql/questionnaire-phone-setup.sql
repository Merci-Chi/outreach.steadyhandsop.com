-- Apply after 20261018190000_assigned_action_questionnaires.sql.
-- Existing responses remain valid; only new submissions require a phone answer.
begin;
alter table public.outreach_action_preferences
  add column if not exists phone_setup text,
  add column if not exists us_phone_number text;

do $$ begin
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.outreach_action_preferences'::regclass and conname='outreach_phone_setup_valid') then
  alter table public.outreach_action_preferences add constraint outreach_phone_setup_valid check (
    (phone_setup is null and us_phone_number is null)
    or (phone_setup is not null and phone_setup='needs_number' and us_phone_number is null)
    or (phone_setup is not null and phone_setup in ('has_number','google_voice')
        and us_phone_number is not null and us_phone_number ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$')
  );
 end if;
end $$;

create or replace function public.outreach_action_submit_v2(
  p_assignment_id uuid,p_selected_path text,p_local_timezone text,p_work_timezone text,
  p_shift_start_minutes integer,p_preferred_weekly_hours integer,
  p_quota_acknowledged boolean,p_confirmed_start_date date,
  p_phone_setup text,p_us_phone_number text
) returns public.outreach_action_preferences
language plpgsql security definer set search_path = '' as $$
declare
  v_digits text;
  v_number text;
  v_result public.outreach_action_preferences%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in.' using errcode='42501'; end if;
  if p_phone_setup is null or p_phone_setup not in ('needs_number','has_number','google_voice') then
    raise exception 'Choose an option for your US calling number.';
  end if;
  if p_phone_setup='needs_number' then
    if nullif(trim(p_us_phone_number),'') is not null then
      raise exception 'A phone number is not required when requesting a US number.';
    end if;
    v_number := null;
  else
    if p_us_phone_number is null or trim(p_us_phone_number) !~ '^[+()0-9 .-]+$' then
      raise exception 'Enter a valid 10-digit US number, or include +1.';
    end if;
    v_digits := regexp_replace(p_us_phone_number,'[^0-9]','','g');
    if length(v_digits)=10 then v_digits := '1'||v_digits; end if;
    if v_digits !~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' then
      raise exception 'Enter a valid 10-digit US number, or include +1.';
    end if;
    v_number := '+'||v_digits;
  end if;
  -- Existing function enforces assignment ownership, quota, dates, timezone,
  -- shift limits, and atomic completion. The owner-only call is intentional.
  perform public.outreach_action_submit(
    p_assignment_id,p_selected_path,p_local_timezone,p_work_timezone,
    p_shift_start_minutes,p_preferred_weekly_hours,p_quota_acknowledged,p_confirmed_start_date
  );
  update public.outreach_action_preferences
    set phone_setup=p_phone_setup,us_phone_number=v_number
    where user_id=auth.uid()
    returning * into strict v_result;
  return v_result;
end $$;

-- Old browser clients must refresh rather than submit without the new answer.
revoke all on function public.outreach_action_submit(uuid,text,text,text,integer,integer,boolean,date)
  from public,anon,authenticated;
revoke all on function public.outreach_action_submit_v2(uuid,text,text,text,integer,integer,boolean,date,text,text)
  from public,anon,authenticated;
grant execute on function public.outreach_action_submit_v2(uuid,text,text,text,integer,integer,boolean,date,text,text)
  to authenticated;
notify pgrst, 'reload schema';
commit;
