import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('caller information is scoped to the authenticated app-call owner and CRM assignment',async()=>{
 const source=await readFile(new URL('../supabase/functions/twilio-inbound-session/index.ts',import.meta.url),'utf8');
 assert.match(source,/if\(action==='caller_info'\)/);
 assert.match(source,/\.eq\('call_sid',callSid\)\.eq\('user_id',userId\)\.eq\('route_destination','app'\)/);
 assert.match(source,/\.eq\('id',incoming\.crm_id\)\.eq\('assigned_user_id',userId\)/);
 assert.match(source,/caller:?.*\}/s);
});
test('incoming caller opens selected lead without reloading the call page',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const incoming=await readFile(new URL('../inbound-calling.js',import.meta.url),'utf8');
 assert.match(app,/steadyhands:open-inbound-caller/);
 assert.match(app,/\.eq\('id',id\)\.eq\('assigned_user_id',userId\)/);
 assert.match(incoming,/invoke\('caller_info',\{call_sid:parent\}\)/);
 assert.match(incoming,/steadyhands:open-inbound-caller/);
 assert.doesNotMatch(incoming,/location\.assign\([^)]*crm_id/);
});
