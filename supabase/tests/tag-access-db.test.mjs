import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const sql=await readFile(new URL('../../sql/tag-catalog-access.sql',import.meta.url),'utf8');
test('all authenticated users read the catalog; active assigned users can save without dashboard access',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table crm_filter_catalog(kind text,name text);insert into crm_filter_catalog values('tag','Warm Lead');
 create table team_permissions(user_id uuid,active boolean);grant select on team_permissions to authenticated;
 insert into team_permissions values('11111111-1111-4111-8111-111111111111',true),('22222222-2222-4222-8222-222222222222',false);
 create table crm(id int,assigned_user_id uuid,admin_archived boolean default false,tags jsonb);alter table crm enable row level security;
 grant select,update on crm to authenticated;
 create policy read_crm on crm for select to authenticated using(true);
 insert into crm(id,assigned_user_id,tags) values(1,'11111111-1111-4111-8111-111111111111','[]'),(2,'22222222-2222-4222-8222-222222222222','[]');`);
 await db.exec(sql);await db.exec(sql);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'`);
 assert.equal((await db.query('select * from crm_filter_catalog')).rows.length,1);
 assert.equal((await db.query(`update crm set tags='["Warm Lead"]' where id=1 returning id`)).rows.length,1);
 assert.equal((await db.query(`update crm set tags='["Warm Lead"]' where id=2 returning id`)).rows.length,0);
 await assert.rejects(db.exec(`update crm set assigned_user_id='22222222-2222-4222-8222-222222222222' where id=1`),/row-level security/);
 await assert.rejects(db.exec("insert into crm_filter_catalog values('tag','New')"),/permission denied/);
 await db.exec(`set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'`);
 assert.equal((await db.query('select * from crm_filter_catalog')).rows.length,1);
 assert.equal((await db.query(`update crm set tags='["Warm Lead"]' where id=2 returning id`)).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from crm_filter_catalog'),/permission denied/);
 }finally{await db.close()}
});
