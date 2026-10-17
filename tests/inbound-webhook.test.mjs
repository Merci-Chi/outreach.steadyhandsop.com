import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as routing from '../supabase/functions/twilio-inbound/routing.mjs';
const source=(await readFile(new URL('../supabase/functions/twilio-inbound/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/:(?:string|any)\b/g,'');
const account='AC'+'a'.repeat(32),parent='CA'+'1'.repeat(32),child='CA'+'2'.repeat(32),base='https://example.supabase.co/functions/v1/twilio-inbound';
function setup(){
 const rows={callcenter_phone_numbers:[{id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'}],callcenter_phone_assignments:[{phone_number_id:'number',user_id:'agent'}],team_permissions:[{user_id:'agent',role:'ADMIN',active:true,listed:true}],callcenter_profiles:[{user_id:'agent',disabled_at:null}],outreach_inbound_settings:[{user_id:'agent',enabled:true,cellphone_number:'+17025550102',voicemail_greeting:'Business greeting'}],outreach_inbound_calls:[]};
 const db={from(table){let filters=[],patch=null,insert=null;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){patch=v;return q},upsert(v){insert=v;return q},maybeSingle(){return run(false)},single(){return run(true)},then(resolve,reject){return run(false).then(resolve,reject)}};
  async function run(single){if(insert&&!rows[table].some(x=>x.call_sid===insert.call_sid))rows[table].push({status:'ringing',cellphone_accepted:false,...insert});const found=rows[table].filter(row=>filters.every(([k,v])=>row[k]===v));if(patch)found.forEach(x=>Object.assign(x,patch));return {data:structuredClone(found[0]||null),error:single&&!found.length?{message:'not found'}:null};}return q;
 }};
 let handler,dbAccess=0;
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-key',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'test-token',TWILIO_INBOUND_WEBHOOK_URL:base};
 vm.runInNewContext(source,{...routing,URL,URLSearchParams,Response,Date,console:{error(){}},createClient(){dbAccess++;return db},twilio:{validateRequest:(_token,signature)=>signature==='valid'},Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn}}});
 const request=(stage='incoming',form={},query='',signature='valid')=>handler(new Request(base+(stage==='incoming'?'':'?stage='+stage+query),{method:'POST',headers:{'X-Twilio-Signature':signature,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({AccountSid:account,CallSid:parent,To:'+17025550101',From:'+17025550103',...form})}));
 return {request,rows,access:()=>dbAccess};
}
test('signed incoming callback routes assigned ADMIN through browser, cell and business voicemail',async()=>{
 const s=setup();assert.match(await (await s.request()).text(),/<Client>/);
 assert.match(await (await s.request('browser-ended',{DialCallStatus:'no-answer'})).text(),/<Number/);
 await s.request('screen',{CallSid:child},'&parent='+parent);
 assert.match(await (await s.request('cell-ended',{DialCallStatus:'completed'})).text(),/<Record /);
});
test('accepted cellphone call completes without voicemail',async()=>{
 const s=setup();await s.request();await s.request('browser-ended',{DialCallStatus:'busy'});await s.request('screen',{CallSid:child},'&parent='+parent);
 await s.request('accept-cell',{CallSid:child,Digits:'1'},'&parent='+parent);
 const xml=await (await s.request('cell-ended',{DialCallStatus:'completed'})).text();assert(!xml.includes('<Record'));assert.equal(s.rows.outreach_inbound_calls[0].answered_via,'cellphone');
});
test('a screening callback for the wrong child cannot accept the call',async()=>{
 const s=setup();await s.request();await s.request('screen',{CallSid:child},'&parent='+parent);
 await s.request('accept-cell',{CallSid:parent,Digits:'1'},'&parent='+parent);
 assert.equal(s.rows.outreach_inbound_calls[0].cellphone_accepted,false);
});
test('successful browser conversation does not ring cellphone',async()=>{
 const s=setup();await s.request();const xml=await (await s.request('browser-ended',{DialCallStatus:'completed'})).text();assert(!xml.includes('<Number'));assert(!xml.includes('<Record'));assert.equal(s.rows.outreach_inbound_calls[0].answered_via,'outreach');
});
test('invalid signature and wrong account are rejected before any database access',async()=>{
 const s=setup();assert.equal((await s.request('incoming',{},'','invalid')).status,403);assert.equal((await s.request('incoming',{AccountSid:'other'})).status,403);assert.equal(s.access(),0);
});
test('disabled number cannot create an incoming call record',async()=>{
 const s=setup();s.rows.callcenter_phone_numbers[0].active=false;const xml=await (await s.request()).text();assert(!xml.includes('<Client>'));assert.equal(s.rows.outreach_inbound_calls.length,0);
});
test('completed recording is attached privately to the original call',async()=>{
 const s=setup();await s.request();await s.request('recorded',{RecordingStatus:'completed',RecordingSid:'RE'+'3'.repeat(32),RecordingDuration:'12'});
 assert.equal(s.rows.outreach_inbound_calls[0].status,'voicemail');assert.equal(s.rows.outreach_inbound_calls[0].recording_duration,12);
});
