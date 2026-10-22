import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../sql/queue-active-state.sql',import.meta.url),'utf8');
test('queue activation is exclusive, reversible, owner-scoped and respects RLS',async()=>{
 const db=new PGlite();const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
  create table outreach_queues(id uuid primary key,owner_id uuid,name text,is_active boolean default false,updated_at timestamptz default now());
  create unique index one_active on outreach_queues(owner_id) where is_active;
  alter table outreach_queues enable row level security;
  create policy own on outreach_queues to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
  grant select,update on outreach_queues to authenticated;`);
  for(let i=0;i<3;i++)await db.query('insert into outreach_queues(id,owner_id,name,is_active) values($1,$2,$3,$4)',[ids[i],i===2?other:user,'Queue '+i,i!==1]);
  await db.exec(sql);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}'`);
  const set=async(id,on)=>db.query('select public.outreach_set_queue_active($1,$2)',[id,on]);
  const active=async()=>(await db.query('select id from outreach_queues where is_active')).rows.map(r=>r.id);
  await set(ids[1],true);assert.deepEqual(await active(),[ids[1]]);
  await set(ids[0],false);assert.deepEqual(await active(),[ids[1]]); // another inactive queue cannot disable the active one
  await set(ids[1],false);assert.deepEqual(await active(),[]);
  await set(ids[0],true);await set(ids[0],true);assert.deepEqual(await active(),[ids[0]]);
  await assert.rejects(set(ids[2],true),/Queue unavailable/);assert.deepEqual(await active(),[ids[0]]);
  await assert.rejects(set(ids[0],null),/Active or Inactive/);
  await db.exec("reset role;create policy paused on outreach_queues as restrictive to authenticated using(false) with check(false);set role authenticated;");
  await assert.rejects(set(ids[1],true),/Queue unavailable/);
  await db.exec('reset role;set role anon;');await assert.rejects(set(ids[0],true),/permission denied/);
 }finally{await db.close();}
});
