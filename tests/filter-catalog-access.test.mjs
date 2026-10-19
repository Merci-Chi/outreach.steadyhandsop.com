import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../sql/outreach-filter-catalog-read.sql',import.meta.url),'utf8');
test('catalog is readable only by active enabled sales/admin users and remains read-only',async()=>{
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table team_permissions(user_id uuid,role text,active boolean);create table callcenter_profiles(user_id uuid,disabled_at timestamptz);
 create table crm_filter_catalog(kind text,name text);insert into crm_filter_catalog values('tag','Interested');
 alter table crm_filter_catalog enable row level security;
 grant usage on schema auth to authenticated;grant select on team_permissions,callcenter_profiles to authenticated;`);
 await assert.rejects(db.exec('set role authenticated;select * from crm_filter_catalog'),/permission denied/);await db.exec('reset role');
 await db.exec(sql);
 const uid='00000000-0000-0000-0000-000000000001';
 for(const [role,active,disabled,expected] of [['SALES',true,false,1],['ADMIN',true,false,1],['BUILDER',true,false,0],['SALES',false,false,0],['ADMIN',true,true,0]]){
  await db.exec(`reset role;truncate team_permissions,callcenter_profiles;insert into team_permissions values('${uid}','${role}',${active});insert into callcenter_profiles values('${uid}',${disabled?"now()":'null'});`);
  await db.query("select set_config('test.uid',$1,false)",[uid]);await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int as n from crm_filter_catalog')).rows[0].n,expected);
  await assert.rejects(db.exec("insert into crm_filter_catalog values('tag','New')"),/permission denied/);
 }
 await db.exec('reset role;set role anon');await assert.rejects(db.exec('select * from crm_filter_catalog'),/permission denied/);
 await db.exec('reset role');await db.close();
});
