import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('inbound transcript SQL derives CRM association from routing snapshot and verifies owner',async()=>{
 const sql=await read('../supabase/migrations/20261022020000_inbound_transcript_identity.sql');
 assert.match(sql,/where id=incoming\.crm_id and assigned_user_id=incoming\.user_id/);
 assert.match(sql,/saved\.crm_id is not null and saved\.crm_id is distinct from linked\.id/);
 assert.match(sql,/on conflict\(call_sid\) do nothing/);
 assert.match(sql,/revoke all on function public\.outreach_start_inbound_transcript/);
 assert.doesNotMatch(sql,/update public\.crm/);
});
test('incoming transcript suggestions require verified prospect, not previously selected lead',async()=>{
 const ui=await read('../outreach-workflow.js');
 const receiver=await read('../inbound-calling.js');
 assert.match(ui,/const inboundTargetValid=/);
 assert.match(ui,/inboundCallSid&&!inboundTargetValid\(\)/);
 assert.match(ui,/if\(!inboundTargetValid\(\)\)/);
 assert.match(receiver,/steadyhands:inbound-caller-identity/);
});
test('router validates caller ownership even on transcription retries',async()=>{
 const router=await read('../supabase/functions/twilio-inbound/index.ts');
 const rpc=router.indexOf("db.rpc('outreach_start_inbound_transcript'");
 const ifExisting=router.indexOf('if(!existing){',rpc);
 assert(rpc>=0&&ifExisting>rpc);
});
