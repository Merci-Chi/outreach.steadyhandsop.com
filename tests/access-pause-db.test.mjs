import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const migration=await readFile(new URL('../supabase/migrations/20261019070000_required_action_access.sql',import.meta.url),'utf8');
test('access follows all outstanding actions and live agreement status without a sticky pause',async()=>{
 const db=new PGlite();
 const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222';
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'$$;
 create table outreach_action_assignments(id int,user_id uuid,status text);
 create table agreement_status(user_id uuid,is_paused boolean);
 insert into agreement_status values('${a}',false),('${b}',true);
 create function sh_get_my_access_pause() returns table(is_paused boolean) language sql security definer as $$select is_paused from agreement_status where user_id=auth.uid()$$;
 create table crm(id int);insert into crm values(1);grant select on crm to authenticated;
 alter table crm enable row level security;create policy own_crm on crm for select to authenticated using(true);
 grant usage on schema auth to authenticated,service_role;`);
 await db.exec(migration);await db.exec(migration);
 await db.exec(`set request.jwt.claim.sub='${a}';set request.jwt.claims='{"role":"authenticated"}';set role authenticated;`);
 const status=async()=>(await db.query('select outreach_access_status() as s')).rows[0].s;
 assert.equal((await status()).is_paused,false);assert.equal((await db.query('select * from crm')).rows.length,1);
 await assert.rejects(db.query('select outreach_access_status($1)',[b]),/own access/);
 await db.exec(`reset role;insert into outreach_action_assignments values(1,'${a}','assigned'),(2,'${a}','assigned'),(3,'${b}','assigned');set role authenticated;`);
 assert.equal((await status()).action_required,true);assert.equal((await db.query('select * from crm')).rows.length,0);
 await db.exec(`reset role;update outreach_action_assignments set status='completed' where id=1;set role authenticated;`);
 assert.equal((await status()).is_paused,true);
 await db.exec(`reset role;update outreach_action_assignments set status='cancelled' where id=2;update agreement_status set is_paused=true where user_id='${a}';set role authenticated;`);
 assert.equal((await status()).action_required,false);assert.equal((await status()).agreement_action_required,true);
 await db.exec(`reset role;update agreement_status set is_paused=false where user_id='${a}';set role authenticated;`);
 assert.equal((await status()).is_paused,false);assert.equal((await db.query('select * from crm')).rows.length,1);
 await db.exec(`reset role;set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
 assert.equal((await db.query('select outreach_access_status($1) as s',[b])).rows[0].s.is_paused,true);
 assert.equal((await db.query('select auth.uid() as id')).rows[0].id,a);
 }finally{await db.close();}
});

test('missing pause row is active while real pauses and required actions stay enforced',async()=>{
 const db=new PGlite();const user='11111111-1111-1111-1111-111111111111';
 const fix=await readFile(new URL('../supabase/migrations/20261019093000_active_account_pause_boolean.sql',import.meta.url),'utf8');
 try {
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'$$;
 create table outreach_action_assignments(id int,user_id uuid,status text);
 create table sh_associate_pause(user_id uuid primary key,status text,selected_track text);
 create function sh_get_my_access_pause() returns table(is_paused boolean,status text,selected_track text)
 language sql stable security definer set search_path to '' as $$
 select (p.status='pause_action_needed'),coalesce(p.status,'active'),p.selected_track
 from (select auth.uid() as uid) u left join public.sh_associate_pause p on p.user_id=u.uid where u.uid is not null $$;
 create table crm(id int);insert into crm values(1);grant select on crm to authenticated;
 create policy existing_access on crm for select to authenticated using(true);
 grant usage on schema auth to authenticated,service_role;`);
 await db.exec(migration);
 await db.exec(`set request.jwt.claim.sub='${user}';set request.jwt.claims='{"role":"authenticated"}';set role authenticated;`);
 const status=async()=>(await db.query('select outreach_access_status() as s')).rows[0].s;
 await assert.rejects(status(),/Account access could not be verified/); // reproduces reported error
 await db.exec('reset role');await db.exec(fix);await db.exec(fix);await db.exec('set role authenticated');
 assert.equal((await status()).is_paused,false);assert.equal((await db.query('select * from crm')).rows.length,1);
 await db.exec(`reset role;insert into sh_associate_pause values('${user}','pause_action_needed','sales');set role authenticated;`);
 assert.equal((await status()).is_paused,true);assert.equal((await db.query('select * from crm')).rows.length,0);
 await db.exec(`reset role;update sh_associate_pause set status='active';insert into outreach_action_assignments values(1,'${user}','assigned');set role authenticated;`);
 assert.equal((await status()).action_required,true);assert.equal((await status()).is_paused,true);
 await db.exec(`reset role;update outreach_action_assignments set status='completed';set role authenticated;`);
 assert.equal((await status()).is_paused,false);
 await db.exec("reset role;set request.jwt.claim.sub='';");
 assert.equal((await db.query('select * from sh_get_my_access_pause()')).rows.length,0);
 } finally {await db.close();}
});
