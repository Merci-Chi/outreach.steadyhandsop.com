-- Binary call status lives in its own column, separate from tags and pipeline stage.
begin;
set local lock_timeout='10s';
set local statement_timeout='30s';
alter table public.crm add column if not exists call_status text not null default 'Not called';
alter table public."callcenter-leads" add column if not exists call_status text not null default 'Not called';
create or replace function crm_dnc_private.set_call_status()
returns trigger language plpgsql set search_path='' as $$
begin
 new.call_status := case when new.lastcalled is not null or coalesce(new.tags,'[]'::jsonb) @> '["Called"]'::jsonb
   then 'Called' else 'Not called' end;
 return new;
end $$;
revoke all on function crm_dnc_private.set_call_status() from public,anon,authenticated;
drop trigger if exists crm_z_call_status on public.crm;
create trigger crm_z_call_status before insert or update on public.crm for each row execute function crm_dnc_private.set_call_status();
drop trigger if exists crm_z_call_status on public."callcenter-leads";
create trigger crm_z_call_status before insert or update on public."callcenter-leads" for each row execute function crm_dnc_private.set_call_status();
update public.crm set call_status='Called' where (lastcalled is not null or tags @> '["Called"]'::jsonb) and call_status<>'Called';
update public."callcenter-leads" set call_status='Called' where (lastcalled is not null or tags @> '["Called"]'::jsonb) and call_status<>'Called';
update public.outreach_queues set name='Not called' where regexp_replace(lower(name),'[^a-z]','','g')='notstarted';
notify pgrst,'reload schema';
commit;
