import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const old=await read('../supabase/migrations/20261019090000_enforce_dnc_suppression.sql');
const previous=await read('../sql/lead-disposition-consistency.sql');
const automatic=await read('../sql/automatic-called-tags.sql');
const separate=await read('../sql/separate-call-status.sql');
test('Called tag is automatic, removes Not started, repairs queues and cannot be added manually',async()=>{
 const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema crm_dnc_private;
 create table crm_dnc_private.suppressed_phones(phone text primary key,source text);
 create table crm(id uuid primary key,phone text,stage text,outcome text,tags jsonb,lastcalled timestamptz,callbackdate date,callbackat timestamptz,admin_archived boolean default false);
 create table "callcenter-leads"(like crm including all);
 create table callcenter_call_activity(id uuid primary key,crm_id uuid,outcome text,created_at timestamptz default now(),ended_at timestamptz);
 create table outreach_queue_items(id uuid primary key,crm_id text,status text default 'pending' check(status in ('pending','completed','skipped')));`);
 await db.exec(old);await db.exec(previous);
 for(let n=1;n<=4;n++)await db.query("insert into crm(id,phone,stage,tags) values($1,$2,'notstarted','[\"Not started\",\"Original\"]')",[id(n),'702555010'+n]);
 await db.query("update crm set tags='[\"Left Voicemail\",\"Not started\"]' where id=$1",[id(1)]);
 await db.query("insert into outreach_queue_items(id,crm_id) values($1,$2)",[id(20),id(1)]);
 await db.exec(automatic);
 const lead=async n=>(await db.query('select * from crm where id=$1',[id(n)])).rows[0];
 assert.deepEqual((await lead(1)).tags,['Left Voicemail','Called']);
 assert.equal((await db.query('select status from outreach_queue_items')).rows[0].status,'completed');
 await db.query("update crm set tags='[\"Called\"]' where id=$1",[id(2)]);
 assert.deepEqual((await lead(2)).tags,[]);assert.equal((await lead(2)).stage,'notstarted');
 await db.query("insert into callcenter_call_activity(id,crm_id,outcome) values($1,$2,'did_not_call')",[id(30),id(2)]);
 assert.equal((await lead(2)).tags.includes('Called'),false);
 await db.query("insert into outreach_queue_items(id,crm_id) values($1,$2)",[id(21),id(2)]);
 await db.query("insert into callcenter_call_activity(id,crm_id,outcome) values($1,$2,'called')",[id(31),id(2)]);
 assert.equal((await lead(2)).stage,'outreach');assert.equal((await lead(2)).tags.includes('Called'),true);
 assert.equal((await db.query('select status from outreach_queue_items where id=$1',[id(21)])).rows[0].status,'completed');
 await db.query("update crm set tags='[\"Not started\",\"Called\",\"called\"]',stage='notstarted' where id=$1",[id(2)]);
 assert.deepEqual((await lead(2)).tags,['Called']);assert.equal((await lead(2)).stage,'outreach');
 await db.query("update outreach_queue_items set status='pending' where id=$1",[id(21)]);
 assert.equal((await db.query('select status from outreach_queue_items where id=$1',[id(21)])).rows[0].status,'completed');
 await db.query("insert into outreach_queue_items(id,crm_id) values($1,$2)",[id(22),id(1)]);
 assert.equal((await db.query('select status from outreach_queue_items where id=$1',[id(22)])).rows[0].status,'completed');
 await db.query("update crm set outcome='Do Not Call',do_not_call=true where id=$1",[id(3)]);
 assert.equal((await lead(3)).tags.includes('Called'),false); // suppression alone is not a call
 await db.exec(previous);await db.exec(automatic);
 assert.deepEqual((await lead(2)).tags,['Called']);
 // Reproduce the original failure: ON COMMIT DROP disappears after an autocommit statement.
 await db.exec('create temporary table called_tag_repair_ids on commit drop as select 1 id');
 await assert.rejects(db.query('select * from called_tag_repair_ids'),/does not exist/);
 // Seed a legacy row and run every corrected repair statement separately.
 await db.query("insert into outreach_queue_items(id,crm_id) values($1,$2)",[id(23),id(4)]);
 await db.exec('alter table crm disable trigger crm_auto_called_tag');
 await db.query("update crm set tags='[\"Left Voicemail\",\"Not started\"]' where id=$1",[id(4)]);
 await db.exec('alter table crm enable trigger crm_auto_called_tag');
 const repair=automatic.slice(automatic.indexOf('with called_tag_repair_ids as'),automatic.indexOf("\ninsert into crm_dnc_private.called_tag_backup(source_table,lead_id,original_record)\n select 'callcenter-leads'"));
 for(const statement of repair.split(';').map(x=>x.trim()).filter(Boolean))await db.exec(statement);
 assert.deepEqual((await lead(4)).tags,['Left Voicemail','Called']);
 assert.equal((await db.query('select status from outreach_queue_items where id=$1',[id(23)])).rows[0].status,'completed');
 await db.exec("create table outreach_queues(id uuid primary key,name text);insert into outreach_queues values('99999999-9999-4999-8999-999999999999','not started')");
 await db.exec(separate);
 assert.equal((await lead(1)).call_status,'Called');
 assert.equal((await lead(3)).call_status,'Not called');
 await db.query("update crm set call_status='Called' where id=$1",[id(3)]);
 assert.equal((await lead(3)).call_status,'Not called');
 assert.equal((await db.query('select name from outreach_queues')).rows[0].name,'Not called');
 await db.exec(separate);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from crm_dnc_private.called_tag_backup'),/permission denied/);
 }finally{await db.close()}
});
