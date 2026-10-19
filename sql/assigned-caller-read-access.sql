-- Outreach checks assignments as the signed-in user before requesting a voice token.
-- Admin management and server-side calling authorization remain separate.
begin;
alter table public.callcenter_phone_assignments enable row level security;
alter table public.callcenter_phone_numbers enable row level security;

drop policy if exists caller_assignment_read_own on public.callcenter_phone_assignments;
create policy caller_assignment_read_own
on public.callcenter_phone_assignments for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists caller_number_read_assigned on public.callcenter_phone_numbers;
create policy caller_number_read_assigned
on public.callcenter_phone_numbers for select to authenticated
using (id in (
  select a.phone_number_id from public.callcenter_phone_assignments a
  where a.user_id = (select auth.uid())
));
commit;
