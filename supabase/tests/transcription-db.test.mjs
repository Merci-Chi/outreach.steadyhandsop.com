import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const migration=await readFile(new URL('../migrations/20261019010000_live_transcription.sql',import.meta.url),'utf8');
for(const idType of ['uuid','bigint'])test('transcript persistence and permissions with '+idType+' CRM IDs',async()=>{
 const db=new PGlite();const user='11111111-2222-3333-4444-555555555555',other='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',call='CA'+'1'.repeat(32);
 const lead=idType==='uuid'?'12345678-1234-1234-1234-123456789012':'123';
 await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key); insert into auth.users values('${user}'),('${other}');
 create table public.crm(id ${idType} primary key,assigned_user_id uuid,company text);
 insert into public.crm values('${lead}','${user}','Test Company');
 create table public.callcenter_call_activity(id ${idType} primary key,user_id uuid,outcome text);
 `);
 await db.exec(migration);
 await db.query('select outreach_start_transcript($1,$2,$3)',[call,user,lead]);
 await db.query('select outreach_start_transcript($1,$2,$3)',[call,user,lead]);
 assert.equal((await db.query('select * from callcenter_transcripts')).rows.length,1);
 await assert.rejects(db.query('select outreach_start_transcript($1,$2,$3)',[call,other,lead]));
 const segment=(n,speaker,text)=>({id:'GTtest:'+n,sequence:n,speaker,text,final:true,timestamp:'2026-10-19T00:00:02Z'});
 for(const s of [segment(4,'customer','Second'),segment(2,'agent','First'),segment(4,'customer','Second')])await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[call,'transcription-content',JSON.stringify(s),null]);
 let row=(await db.query('select * from callcenter_transcripts')).rows[0];
 assert.equal(row.segments.length,2);assert.equal(row.transcript,'You: First\nProspect: Second');assert.equal(row.segments[0].start_seconds,0);
 await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[call,'transcription-stopped',null,null]);
 await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[call,'transcription-started',null,null]);
 await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[call,'transcription-content',JSON.stringify(segment(5,'customer','Late final')),null]);
 row=(await db.query('select * from callcenter_transcripts')).rows[0];assert.equal(row.transcription_status,'stopped');assert.equal(row.segments.length,3);assert(row.ended_at);
 await assert.rejects(db.query('select outreach_apply_transcription($1,$2,$3,$4)',['CA'+'9'.repeat(32),'transcription-stopped',null,null]));
 const activity=idType==='uuid'?'87654321-1234-1234-1234-123456789012':'456';
 await db.query('insert into callcenter_call_activity(id,user_id,outcome,call_sid) values($1,$2,$3,$4)',[activity,user,'Interested',call]);
 row=(await db.query('select * from callcenter_transcripts')).rows[0];assert.equal(String(row.call_activity_id),activity);assert.equal(row.outcome,'Interested');
 await db.exec(`grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated; set role authenticated; set test.uid='${other}';`);
 assert.equal((await db.query('select * from callcenter_transcripts')).rows.length,0);
 await assert.rejects(db.query('select outreach_start_transcript($1,$2,$3)',[call,user,lead]));
 await db.exec(`set test.uid='${user}';`);assert.equal((await db.query('select * from callcenter_transcripts')).rows.length,1);
 await db.close();
});

const inboundMigration=await readFile(new URL('../migrations/20261019020000_inbound_transcription.sql',import.meta.url),'utf8');
test('inbound transcripts derive ownership from routing, reverse parent-leg speakers, and remain private',async()=>{
 const db=new PGlite(),user='11111111-2222-3333-4444-555555555555',other='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',sid='CA'+'2'.repeat(32);
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${user}'),('${other}');
 create table public.crm(id bigint primary key,assigned_user_id uuid,company text);
 create table public.callcenter_call_activity(id bigint primary key,user_id uuid,outcome text);
 create table public.outreach_inbound_calls(call_sid text primary key,user_id uuid,route_destination text,from_number text);
 insert into public.outreach_inbound_calls values('${sid}','${user}','app','+17025550101');`);
 await db.exec(migration);await db.exec(migration);
 await db.exec(inboundMigration);await db.exec(inboundMigration);
 await db.query('select outreach_start_inbound_transcript($1)',[sid]);await db.query('select outreach_start_inbound_transcript($1)',[sid]);
 let row=(await db.query('select * from callcenter_transcripts')).rows[0];assert.equal(row.user_id,user);assert.equal(row.crm_id,null);assert.equal(row.call_direction,'inbound');
 for(const [sequence,speaker,text] of [[1,'agent','Caller speaking'],[2,'customer','Agent speaking'],[2,'customer','Agent speaking']]){
  await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[sid,'transcription-content',JSON.stringify({id:'GT:'+sequence,sequence,speaker,text}),null]);
 }
 row=(await db.query('select * from callcenter_transcripts')).rows[0];assert.equal(row.transcript,'Prospect: Caller speaking\nYou: Agent speaking');assert.equal(row.segments.length,2);
 await db.exec(`update outreach_inbound_calls set user_id='${other}';`);
 await assert.rejects(db.query('select outreach_start_inbound_transcript($1)',[sid]),/ownership mismatch/);
 await db.exec(`update outreach_inbound_calls set user_id=null;`);
 await assert.rejects(db.query('select outreach_start_inbound_transcript($1)',[sid]),/assigned app route/);
 await db.exec(`grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;set role authenticated;set test.uid='${other}';`);
 assert.equal((await db.query('select * from callcenter_transcripts')).rows.length,0);
 await assert.rejects(db.query('select outreach_start_inbound_transcript($1)',[sid]),/permission denied/);
 await db.exec(`set test.uid='${user}';`);assert.equal((await db.query('select * from callcenter_transcripts')).rows.length,1);
 }finally{await db.close();}
});

const liveMigration=await readFile(new URL('../migrations/20261019030000_transcript_live_updates.sql',import.meta.url),'utf8');
test('live interim revisions replace text without entering history and cannot regress finalized speech',async()=>{
 const db=new PGlite(),user='11111111-2222-3333-4444-555555555555',sid='CA'+'3'.repeat(32);
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${user}');
 create table public.crm(id bigint primary key,assigned_user_id uuid,company text);
 create table public.callcenter_call_activity(id bigint primary key,user_id uuid,outcome text);
 create table public.outreach_inbound_calls(call_sid text primary key,user_id uuid,route_destination text,from_number text);
 insert into public.outreach_inbound_calls values('${sid}','${user}','app','+17025550101');`);
 await db.exec(migration);await db.exec(inboundMigration);await db.exec(liveMigration);await db.exec(liveMigration);
 await db.query('select outreach_start_inbound_transcript($1)',[sid]);
 const apply=async(sequence,text,final=false,speaker='agent')=>db.query('select outreach_apply_transcription($1,$2,$3,$4)',[sid,'transcription-content',JSON.stringify({id:'GT:'+sequence,sequence,speaker,text,final}),null]);
 const row=async()=>(await db.query('select * from callcenter_transcripts where call_sid=$1',[sid])).rows[0];
 await apply(1,'Not');await apply(3,'Not interested');await apply(2,'Old partial');
 let r=await row();assert.equal(r.transcript,'');assert.equal(r.segments.length,0);assert.equal(r.interim_segments.customer.text,'Not interested');
 await apply(4,'Not interested.',true);r=await row();assert.equal(r.transcript,'Prospect: Not interested.');assert.deepEqual(r.interim_segments,{});
 await apply(3,'Stale partial');assert.deepEqual((await row()).interim_segments,{});
 await apply(6,'Next phrase');await apply(5,'Late earlier final.',true);r=await row();assert.equal(r.interim_segments.customer.text,'Next phrase');assert.equal(r.segments.length,2);
 await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[sid,'transcription-stopped',null,null]);
 await apply(8,'After stop');assert.deepEqual((await row()).interim_segments,{});
 await apply(9,'Late final.',true);r=await row();assert.equal(r.transcription_status,'stopped');assert.equal(r.segments.length,3);assert(r.transcript_revision>0);
 // The same callback function keeps outbound speaker mapping unchanged.
 const out='CA'+'4'.repeat(32);await db.query('insert into callcenter_transcripts(user_id,call_sid) values($1,$2)',[user,out]);
 await db.query('select outreach_apply_transcription($1,$2,$3,$4)',[out,'transcription-content',JSON.stringify({id:'GT:out',sequence:1,speaker:'agent',text:'Hello',final:true}),null]);
 assert.equal((await db.query('select transcript from callcenter_transcripts where call_sid=$1',[out])).rows[0].transcript,'You: Hello');
 }finally{await db.close();}
});

const pushStatusMigration=await readFile(new URL('../migrations/20261019050000_push_delivery_status.sql',import.meta.url),'utf8');
const pushMigration=await readFile(new URL('../migrations/20261019040000_pwa_call_push.sql',import.meta.url),'utf8');
test('PWA push/device storage is idempotent and inaccessible to direct browser database writes',async()=>{
 const db=new PGlite(),user='11111111-2222-3333-4444-555555555555';
 try{
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key);insert into auth.users values('${user}');
 create table public.outreach_inbound_calls(call_sid text primary key,user_id uuid);
 `);
 await db.exec(pushMigration);await db.exec(pushMigration);await db.exec(pushStatusMigration);await db.exec(pushStatusMigration);
 await db.exec(`grant usage on schema public to service_role,authenticated;set role service_role;
 insert into outreach_inbound_push_subscriptions(user_id,endpoint,p256dh,auth) values('${user}','https://web.push.apple.com/test','key','auth');
 insert into outreach_inbound_devices(user_id,device_id,ready) values('${user}','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',true);`);
 assert.equal((await db.query('select * from outreach_inbound_push_subscriptions')).rows.length,1);
 await db.exec('reset role;set role authenticated;');
 await assert.rejects(db.query('select * from outreach_inbound_push_subscriptions'),/permission denied/);
 await assert.rejects(db.query('select * from outreach_inbound_devices'),/permission denied/);
 await assert.rejects(db.query("update outreach_inbound_devices set ready=true"),/permission denied/);
 }finally{await db.close();}
});
