-- Shared project: apply ONCE in Supabase SQL Editor before deploying both apps.
-- Number-level greetings replace legacy Outreach per-user greetings.
begin;
alter table public.callcenter_phone_numbers
 add column if not exists voicemail_greeting text not null default 'Thank you for calling Steady Hands. We are unavailable to take your call at the moment. Please try again or contact our support team at (702) 775-9756. You may also leave a message after the beep.';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.callcenter_phone_numbers'::regclass and conname='phone_voicemail_greeting_check') then
  alter table public.callcenter_phone_numbers add constraint phone_voicemail_greeting_check
   check (length(btrim(voicemail_greeting)) between 1 and 500);
 end if;
end $$;
create or replace function public.admin_set_phone_voicemail(p_phone_number_id text,p_greeting text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.team_permissions
  where user_id=auth.uid() and role='ADMIN' and active=true for share;
 if not found then raise exception 'Active ADMIN access required' using errcode='42501';end if;
 if p_greeting is null or length(btrim(p_greeting)) not between 1 and 500 then
  raise exception 'Enter a greeting between 1 and 500 characters.';
 end if;
 update public.callcenter_phone_numbers set voicemail_greeting=btrim(p_greeting),updated_at=now()
  where id::text=p_phone_number_id;
 if not found then raise exception 'Phone number no longer exists. Refresh and try again.';end if;
end $$;
revoke all on function public.admin_set_phone_voicemail(text,text) from public,anon;
grant execute on function public.admin_set_phone_voicemail(text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
