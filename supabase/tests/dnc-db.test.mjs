import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const migration=await readFile(new URL('../migrations/20261019090000_enforce_dnc_suppression.sql',import.meta.url),'utf8');
for(const idType of ['uuid','bigint'])test('DNC enforcement, backups and permissions with '+idType+' CRM IDs',async()=>{
 const db=new PGlite();
 const ids=idType==='uuid'?['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333']:['1','2','3'];
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema crm_dnc_private;
 revoke all on schema crm_dnc_private from public,anon,authenticated;
 create table crm_dnc_private.suppressed_phones(phone text primary key,source text not null);
 insert into crm_dnc_private.suppressed_phones values('7025550100','Uploaded list');
 create table public.crm(id ${idType} primary key,phone text,stage text,outcome text,tags jsonb,callbackdate date,callbackat timestamptz);
 insert into public.crm(id,phone,stage,callbackdate) values('${ids[0]}','(702) 555-0100','outreach','2026-10-20'),('${ids[1]}','7025550101','outreach',null);
 insert into public.crm(id,phone,tags) values('${ids[2]}','+1 702-555-0102','["DNC"]');`);
 await db.exec(migration);
 const check=async(phone,id=null)=>(await db.query('select outreach_call_is_blocked($1,$2) as blocked',[phone,id])).rows[0].blocked;
 assert.equal(await check('+17025550100'),true);
 assert.equal(await check('702.555.0100',ids[1]),true); // unrelated CRM ID cannot bypass destination suppression
 assert.equal(await check('7025550101',ids[0]),true); // blocked CRM ID also blocks a substituted number
 assert.equal(await check('7025550101',ids[1]),false);
 assert.equal(await check('7025550102'),true); // existing dispositions seeded into number suppression
 let rows=(await db.query('select * from crm order by id')).rows;
 assert.equal(rows.length,3);assert.equal(rows[0].do_not_call,true);assert.equal(rows[0].stage,'donotcall');assert.equal(rows[0].callbackdate,null);
 const backup=(await db.query('select original_record from crm_dnc_private.crm_record_backup where lead_id=$1',[ids[0]])).rows[0].original_record;
 assert.equal(backup.stage,'outreach');assert.equal(backup.callbackdate,'2026-10-20');
 await db.query("update crm set do_not_call=false,stage='outreach',outcome=null where id=$1",[ids[0]]);
 assert.equal((await db.query('select do_not_call from crm where id=$1',[ids[0]])).rows[0].do_not_call,true);
 await db.query('update crm set phone=$1 where id=$2',['1 (702) 555-0100',ids[1]]);
 assert.equal((await db.query('select do_not_call from crm where id=$1',[ids[1]])).rows[0].do_not_call,true);
 // New duplicate imports receive DNC flags before they become callable.
 await db.query('delete from crm where id=$1',[ids[1]]);
 await db.query("insert into crm(id,phone,stage) values($1,$2,'outreach')",[ids[1],'+17025550100']);
 assert.equal((await db.query('select do_not_call from crm where id=$1',[ids[1]])).rows[0].do_not_call,true);
 await db.exec(migration); // safe rerun preserves original backups
 assert.equal((await db.query('select original_record from crm_dnc_private.crm_record_backup where lead_id=$1',[ids[0]])).rows[0].original_record.stage,'outreach');
 await db.exec('set role authenticated');
 assert.equal(await check('7025550100'),true);
 await assert.rejects(db.query('select * from crm_dnc_private.suppressed_phones'),/permission denied/);
 await assert.rejects(db.query('select * from crm_dnc_private.crm_record_backup'),/permission denied/);
 await db.exec('reset role;set role service_role');assert.equal(await check('7025550100'),true);
 await db.exec('reset role;set role anon');await assert.rejects(check('7025550100'),/permission denied/);
 } finally {await db.close();}
});
test('migration refuses to proceed without the uploaded DNC list',async()=>{
 const db=new PGlite();try{await assert.rejects(db.exec(migration),/Install the uploaded DNC suppression list/);}finally{await db.close();}
});
