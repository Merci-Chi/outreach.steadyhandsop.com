import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const migration=await readFile(new URL('../migrations/20261019110000_automatic_requirement_completion.sql',import.meta.url),'utf8');
test('requirements release their pause only after the final saved completion, including existing stale flags',async()=>{
 const db=new PGlite();
 const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222',c='33333333-3333-3333-3333-333333333333',d='44444444-4444-4444-4444-444444444444';
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table sh_associate_pause(user_id uuid primary key,status text,selected_track text);
 create table outreach_action_assignments(id int primary key,user_id uuid,status text);
 create table sh_individual_agreement_actions(code text primary key,user_id uuid,status text);
 insert into sh_associate_pause values('${a}','pause_action_needed','sales'),('${b}','pause_action_needed','sales'),('${c}','disabled','sales'),('${d}','pause_action_needed','sales');
 insert into outreach_action_assignments values(1,'${a}','assigned'),(2,'${a}','assigned'),(3,'${b}','completed'),(4,'${c}','completed');
 insert into sh_individual_agreement_actions values('agreement','${a}','pending');`);
 await db.exec(migration);await db.exec(migration);
 const status=async(user)=>(await db.query('select status from sh_associate_pause where user_id=$1',[user])).rows[0].status;
 assert.equal(await status(b),'active');assert.equal(await status(c),'disabled');assert.equal(await status(d),'pause_action_needed');
 await db.query("update outreach_action_assignments set status='completed' where id=1");assert.equal(await status(a),'pause_action_needed');
 await db.query("update outreach_action_assignments set status='completed' where id=2");assert.equal(await status(a),'pause_action_needed');
 await db.query("update sh_individual_agreement_actions set status='signed' where code='agreement'");assert.equal(await status(a),'active');
 await db.exec(`set test.uid='${a}'`);
 assert.equal((await db.query('select * from sh_get_my_access_pause()')).rows[0].is_paused,false);
 await db.exec(`insert into outreach_action_assignments values(5,'${d}','assigned');update outreach_action_assignments set status='cancelled' where id=5;`);
 assert.equal(await status(d),'active');
 await db.exec('set role authenticated');await assert.rejects(db.query('select outreach_reconcile_completed_requirements($1)',[a]),/permission denied/);
 }finally{await db.close();}
});
