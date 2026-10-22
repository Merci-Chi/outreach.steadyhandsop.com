import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const sql=await readFile(new URL('../sql/lead-disposition-consistency.sql',import.meta.url),'utf8');
const old=await readFile(new URL('../supabase/migrations/20261019090000_enforce_dnc_suppression.sql',import.meta.url),'utf8');
test('repair historical stages and enforce dispositions for updates, duplicate phones and server dialing',async()=>{
 const db=new PGlite();
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema crm_dnc_private;
 create table crm_dnc_private.suppressed_phones(phone text primary key,source text);
 create table crm(id uuid primary key,phone text,stage text,outcome text,tags jsonb,lastcalled timestamptz,callbackdate date,callbackat timestamptz,admin_archived boolean default false);
 create table "callcenter-leads"(like crm including all, check(stage in ('notstarted','outreach','notinterested')));
 create table callcenter_call_activity(id uuid primary key,crm_id uuid,outcome text,created_at timestamptz default now(),ended_at timestamptz);`);
 await db.exec(old);
 const rows=[['Wrong Number'],['Left Voicemail'],['Not Interested'],['Wrong Number','Left Voicemail'],['No Answer'],[]];
 for(let n=1;n<=rows.length;n++)await db.query("insert into crm(id,phone,stage,tags) values($1,$2,'notstarted',$3)",[id(n),'70255501'+String(n).padStart(2,'0'),JSON.stringify(rows[n-1])]);
 await db.query("insert into callcenter_call_activity(id,crm_id,outcome) values($1,$2,'called')",[id(10),id(6)]);
 await db.query("insert into \"callcenter-leads\"(id,stage,tags) values($1,'notstarted','[\"DNC\"]')",[id(88)]);
 await db.exec(sql);
 assert.equal((await db.query('select stage from "callcenter-leads"')).rows[0].stage,'outreach');
 const check=async(n,lead=null)=>(await db.query('select outreach_call_is_blocked($1,$2) b',['+170255501'+String(n).padStart(2,'0'),lead])).rows[0].b;
 assert.equal(await check(1),true);assert.equal(await check(1,id(2)),true);assert.equal(await check(2,id(1)),true);
 assert.equal(await check(2),false);assert.equal(await check(3),true);assert.equal(await check(4),true);assert.equal(await check(5),false);assert.equal(await check(6),true);
 assert.deepEqual((await db.query('select stage from crm order by id')).rows.map(r=>r.stage),['outreach','outreach','notinterested','outreach','outreach','outreach']);
 assert.equal((await db.query('select count(*)::int n from crm_dnc_private.contact_stage_backup')).rows[0].n,7);
 await db.query("update crm set stage='notstarted' where id=$1",[id(1)]);
 assert.equal((await db.query('select stage from crm where id=$1',[id(1)])).rows[0].stage,'outreach');
 await db.query("insert into crm(id,phone,stage,tags) values($1,'7025550199','notstarted','[]')",[id(99)]);
 assert.equal(await check(99),false);
 // Reproduce a fresh lead that was put in the Outreach pipeline without a call.
 await db.query("insert into crm(id,phone,stage,tags) values($1,'7025550177','outreach','[]')",[id(77)]);
 assert.equal(await check(77),true);
 await db.exec(await readFile(new URL('../sql/fresh-outreach-call-eligibility.sql',import.meta.url),'utf8'));
 assert.equal(await check(77),false);
 assert.equal(await check(1),true); // wrong-number evidence is still enforced
 assert.equal(await check(3),true); // not-interested evidence is still enforced
 assert.equal(await check(6),true); // real call history is still enforced
 await db.exec("set role authenticated");
 assert.equal(await check(77),false);
 await db.exec("reset role");
 await db.query("insert into callcenter_call_activity(id,crm_id,outcome) values($1,$2,'did_not_call')",[id(100),id(99)]);
 assert.equal(await check(99),false);
 await db.query("insert into callcenter_call_activity(id,crm_id,outcome) values($1,$2,'called')",[id(101),id(99)]);
 assert.equal(await check(99),true);
 await db.query("update crm set outcome='No Answer',tags='[\"No Answer\"]' where id=$1",[id(99)]);assert.equal(await check(99),false);
 await db.exec(sql);
 assert.equal((await db.query('select original_record->>\'stage\' s from crm_dnc_private.contact_stage_backup where lead_id=$1',[id(1)])).rows[0].s,'notstarted');
 await db.exec('set role authenticated');assert.equal(await check(1),true);
 await assert.rejects(db.query('select * from crm_dnc_private.contact_stage_backup'),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(check(1),/permission denied/);
 }finally{await db.close();}
});
