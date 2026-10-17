import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {identity} from '../supabase/functions/twilio-inbound/routing.mjs';
const source=(await readFile(new URL('../supabase/functions/twilio-inbound-session/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/:(?:any|Response|string)\b/g,'').replace("audio.headers.get('location')!","audio.headers.get('location')");
function setup({active=true,validAuth=true}={}){
 const rows={team_permissions:[{user_id:'agent',role:'ADMIN',active,listed:true}],callcenter_profiles:[{user_id:'agent',disabled_at:null}],callcenter_phone_assignments:[{user_id:'agent',phone_number_id:'number'}],callcenter_phone_numbers:[{id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'}],outreach_inbound_settings:[{user_id:'agent',enabled:true,cellphone_number:'+17025550102'}],outreach_inbound_calls:[{user_id:'other',call_sid:'other-call',recording_sid:'RE'+'1'.repeat(32)}]};
 let issued,handler,dbAccess=0;
 const db={auth:{getUser:async()=>validAuth?{data:{user:{id:'agent'}}}:{error:{message:'bad token'}}},from(table){
  dbAccess++;let filters=[],insert=null;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},upsert(v){insert=v;return q},maybeSingle:()=>run(true),then:(resolve,reject)=>run(false).then(resolve,reject)};
  async function run(single){if(insert){const old=rows[table].find(x=>x.user_id===insert.user_id);if(old)Object.assign(old,insert);else rows[table].push(insert);}const result=rows[table].filter(x=>filters.every(([k,v])=>x[k]===v));return {data:structuredClone(single?result[0]||null:result)};}return q;
 }};
 class AccessToken{static VoiceGrant=class{constructor(options){this.options=options}};constructor(_a,_k,_s,options){this.options=options;issued=this;}addGrant(grant){this.grant=grant}toJwt(){return 'test-incoming-token'}}
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',TWILIO_ACCOUNT_SID:'test',TWILIO_AUTH_TOKEN:'test',TWILIO_API_KEY_SID:'test',TWILIO_API_KEY_SECRET:'test'};
 vm.runInNewContext(source,{identity,URL,Uint8Array,String,Response,btoa,console:{error(){}},createClient:()=>db,twilio:{jwt:{AccessToken}},Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn}}});
 const request=(action,body={})=>handler(new Request('https://example.supabase.co/functions/v1/twilio-inbound-session',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action,...body})}));
 return {rows,request,issued:()=>issued,access:()=>dbAccess};
}
test('incoming-only token uses the authenticated agent identity',async()=>{
 const s=setup();const result=await s.request('token');assert.equal(result.status,200);assert.equal((await result.json()).token,'test-incoming-token');assert.equal(s.issued().options.identity,identity('agent'));assert.equal(s.issued().grant.options.incomingAllow,true);assert.equal(s.issued().grant.options.outgoingApplicationSid,undefined);
});
test('disabled agent cannot get a token or change routing',async()=>{
 const s=setup({active:false});assert.equal((await s.request('token')).status,403);assert.equal((await s.request('save_settings',{cellphone_number:'+17025550103',voicemail_greeting:'Hello',enabled:true})).status,403);
});
test('invalid login is rejected before database reads',async()=>{const s=setup({validAuth:false});assert.equal((await s.request('settings')).status,401);assert.equal(s.access(),0)});
test('business numbers cannot be used as forwarding cellphone',async()=>{const s=setup();assert.equal((await s.request('save_settings',{cellphone_number:'+17025550101',voicemail_greeting:'Hello',enabled:true})).status,400)});
test('routing settings always save to the authenticated user',async()=>{
 const s=setup();assert.equal((await s.request('save_settings',{user_id:'other',cellphone_number:'+17025550103',voicemail_greeting:'Hello',enabled:true})).status,200);assert.equal(s.rows.outreach_inbound_settings[0].user_id,'agent');assert.equal(s.rows.outreach_inbound_settings[0].cellphone_number,'+17025550103');
});
test('voicemail inbox and audio access cannot cross agent ownership',async()=>{
 const s=setup();const inbox=await (await s.request('settings')).json();assert.equal(inbox.calls.length,0);assert.equal((await s.request('play_voicemail',{call_sid:'other-call'})).status,404);
});
