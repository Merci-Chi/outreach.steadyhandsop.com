-- Proposed migration. REVIEW ONLY. Do not run until the full PR is tested.
begin;
create table if not exists public.outreach_handoff_recipients (
 user_id uuid primary key references auth.users(id) on delete cascade,
 kind text not null check (kind in ('development','spanish')),
 active boolean not null default true
);
create table if not exists public.outreach_lead_handoffs (
 id uuid primary key default gen_random_uuid(),
 crm_id uuid not null references public.crm(id) on delete cascade,
 sender_id uuid not null references auth.users(id),
 recipient_id uuid not null references auth.users(id),
 kind text not null check (kind in ('development','spanish')),
 notes text not null default '',
 status text not null default 'pending' check (status in ('pending','accepted','cancelled')),
 created_at timestamptz not null default now(),
 accepted_at timestamptz
);
create index if not exists outreach_handoffs_recipient_idx on public.outreach_lead_handoffs(recipient_id,status,created_at desc);
create unique index if not exists outreach_pending_handoff_unique on public.outreach_lead_handoffs(crm_id,kind) where status='pending';
alter table public.outreach_handoff_recipients enable row level security;
alter table public.outreach_lead_handoffs enable row level security;
revoke all on public.outreach_handoff_recipients,public.outreach_lead_handoffs from anon,authenticated;
grant select on public.outreach_handoff_recipients to authenticated;
grant select on public.outreach_lead_handoffs to authenticated;
create policy handoff_recipients_visible on public.outreach_handoff_recipients
 for select to authenticated using (active and (select auth.uid()) is not null);
create policy handoffs_participants_read on public.outreach_lead_handoffs
 for select to authenticated using (sender_id=(select auth.uid()) or recipient_id=(select auth.uid()));
create or replace function public.outreach_send_lead(p_crm_id uuid,p_recipient_id uuid,p_kind text,p_notes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sender uuid:=auth.uid(); v_id uuid; v_name text;
begin
 if v_sender is null or p_recipient_id=v_sender or p_kind not in ('spanish','development') then raise exception 'Invalid handoff'; end if;
 perform 1 from public.crm c where c.id=p_crm_id and c.assigned_user_id=v_sender and coalesce(c.admin_archived,false)=false for update;
 if not found then raise exception 'Prospect is not assigned to you'; end if;
 if not exists(select 1 from public.outreach_handoff_recipients r join public.team_permissions p on p.user_id=r.user_id and p.active=true
 where r.user_id=p_recipient_id and r.kind=p_kind and r.active=true) then raise exception 'Recipient is not eligible'; end if;
 select coalesce(nullif(c.company,''),nullif(c.name,''),'a lead') into v_name from public.crm c where c.id=p_crm_id;
 insert into public.outreach_lead_handoffs(crm_id,sender_id,recipient_id,kind,notes)
 values(p_crm_id,v_sender,p_recipient_id,p_kind,left(coalesce(p_notes,''),2000)) returning id into v_id;
 insert into public.outreach_notifications(recipient_id,title,body,lead_id,kind)
 values(p_recipient_id,
 coalesce((select nullif(split_part(u.email,'@',1),'') from auth.users u where u.id=v_sender),'An associate')||' has shared a lead with you',
 v_name||' · '||case when p_kind='spanish' then 'Spanish-speaking sales transfer' else 'Development request' end,
 p_crm_id::text,'lead_handoff');
 return v_id;
end $$;
create or replace function public.outreach_accept_lead_handoff(p_handoff_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare h public.outreach_lead_handoffs%rowtype;
begin
 select * into strict h from public.outreach_lead_handoffs where id=p_handoff_id for update;
 if auth.uid() is distinct from h.recipient_id or h.status <> 'pending' then raise exception 'Handoff unavailable'; end if;
 if not exists(select 1 from public.outreach_handoff_recipients r join public.team_permissions p on p.user_id=r.user_id and p.active
 where r.user_id=h.recipient_id and r.kind=h.kind and r.active) then raise exception 'Recipient no longer eligible'; end if;
 if h.kind='spanish' then
  update public.crm set assigned_user_id=h.recipient_id where id=h.crm_id and assigned_user_id=h.sender_id;
  if not found then raise exception 'Prospect assignment has changed'; end if;
 end if;
 update public.outreach_lead_handoffs set status='accepted',accepted_at=now() where id=h.id;
 return h.crm_id;
end $$;
revoke all on function public.outreach_send_lead(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.outreach_accept_lead_handoff(uuid) from public,anon,authenticated;
grant execute on function public.outreach_send_lead(uuid,uuid,text,text) to authenticated;
grant execute on function public.outreach_accept_lead_handoff(uuid) to authenticated;
commit;
