import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration = await readFile(new URL('../migrations/20261022010000_inbound_caller_matching.sql', import.meta.url), 'utf8');
const sid = n => 'CA' + String(n).repeat(32);
const uid = '11111111-2222-3333-4444-555555555555';
const other = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('incoming caller resolution is unique, owner-scoped and stable per Call SID', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role service_role; create role anon; create role authenticated;\n      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${uid}'), ('${other}');
      create table public.crm(
        id uuid primary key, assigned_user_id uuid, phone text, altphone text
      );
      create table public.outreach_inbound_calls(
        call_sid text primary key, user_id uuid, from_number text,
        updated_at timestamptz default now()
      );
      insert into public.crm values
        ('00000000-0000-0000-0000-000000000001','${uid}','(702) 555-0101',null),
        ('00000000-0000-0000-0000-000000000002','${uid}',null,'702-555-0102'),
        ('00000000-0000-0000-0000-000000000003','${other}','7025550103',null),
        ('00000000-0000-0000-0000-000000000004','${uid}','7025550104',null),
        ('00000000-0000-0000-0000-000000000005','${uid}',null,'+1 702 555 0104');
      insert into public.outreach_inbound_calls(call_sid,user_id,from_number) values
        ('${sid(1)}','${uid}','+17025550101'),
        ('${sid(2)}','${uid}','7025550102'),
        ('${sid(3)}','${uid}','+17025550103'),
        ('${sid(4)}','${uid}','+17025550104'),
        ('${sid(5)}','${uid}','anonymous');
    `);
    await db.exec(migration);
    const get = async id => (await db.query('select * from public.outreach_resolve_inbound_caller($1)',[sid(id)])).rows[0];
    assert.deepEqual(await get(1), {match_status:'matched',matched_crm_id:'00000000-0000-0000-0000-000000000001'});
    assert.equal((await get(2)).match_status,'matched');
    assert.equal((await get(3)).match_status,'unknown');
    assert.equal((await get(4)).match_status,'ambiguous');
    assert.equal((await get(4)).matched_crm_id,null);
    assert.equal((await get(5)).match_status,'unknown');
    await db.query("update public.crm set phone = '+17025550199' where id = '00000000-0000-0000-0000-000000000001'");
    assert.equal((await get(1)).matched_crm_id,'00000000-0000-0000-0000-000000000001');
    await assert.rejects(get(9));
    await db.exec(migration);
  } finally {
    await db.close();
  }
});

test('inbound router calls owner-scoped matching only after recording the parent Call SID', async () => {
  const router = await readFile(new URL('../functions/twilio-inbound/index.ts', import.meta.url), 'utf8');
  assert(router.includes("db.rpc('outreach_resolve_inbound_caller',{p_call_sid:callSid})"));
  assert(router.indexOf("db.from('outreach_inbound_calls').upsert") < router.indexOf("db.rpc('outreach_resolve_inbound_caller'"));
});
