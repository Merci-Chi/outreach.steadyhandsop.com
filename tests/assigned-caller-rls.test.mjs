import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const sql=await readFile(new URL('../sql/assigned-caller-read-access.sql',import.meta.url),'utf8');
test('assigned callers can read their own number without reading or changing other assignments',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      create table callcenter_phone_numbers(id text primary key,phone_number text,active boolean,twilio_status text);
      create table callcenter_phone_assignments(user_id uuid primary key,phone_number_id text references callcenter_phone_numbers);
      insert into callcenter_phone_numbers values ('a','+17025550101',true,'ready'),('b','+17025550102',true,'ready');
      insert into callcenter_phone_assignments values
        ('11111111-1111-1111-1111-111111111111','a'),('22222222-2222-2222-2222-222222222222','b');
      alter table callcenter_phone_assignments enable row level security;
      alter table callcenter_phone_numbers enable row level security;
      grant select,update,delete,insert on callcenter_phone_assignments,callcenter_phone_numbers to authenticated;
      grant select on callcenter_phone_assignments,callcenter_phone_numbers to anon;
      set role authenticated;
      set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
    `);
    const rows=async table=>(await db.query('select * from '+table)).rows;
    assert.equal((await rows('callcenter_phone_assignments')).length,0); // reproduce missing read policy
    await db.exec('reset role');
    await db.exec(sql);
    await db.exec(sql); // safe to reapply
    await db.exec('set role authenticated');
    assert.deepEqual((await rows('callcenter_phone_assignments')).map(r=>r.phone_number_id),['a']);
    assert.deepEqual((await rows('callcenter_phone_numbers')).map(r=>r.id),['a']);
    assert.equal((await db.query("update callcenter_phone_numbers set active=false returning id")).rows.length,0);
    assert.equal((await db.query('delete from callcenter_phone_assignments returning user_id')).rows.length,0);
    await assert.rejects(db.exec("insert into callcenter_phone_assignments values ('33333333-3333-3333-3333-333333333333','b')"),/row-level security/);
    await db.exec("reset role; update callcenter_phone_assignments set phone_number_id='b' where phone_number_id='a'; set role authenticated;");
    assert.deepEqual((await rows('callcenter_phone_numbers')).map(r=>r.id),['b']);
    await db.exec("set request.jwt.claim.sub='33333333-3333-3333-3333-333333333333'");
    assert.equal((await rows('callcenter_phone_assignments')).length,0);
    assert.equal((await rows('callcenter_phone_numbers')).length,0);
    await db.exec("reset role; set role anon; set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'");
    assert.equal((await rows('callcenter_phone_assignments')).length,0);
    assert.equal((await rows('callcenter_phone_numbers')).length,0);
  } finally {await db.close();}
});
