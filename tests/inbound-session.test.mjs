import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {identity} from '../supabase/functions/twilio-inbound/routing.mjs';
const source=(await readFile(new URL('../supabase/functions/twilio-inbound-session/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/:(?:any|Response|string)\b/g,'').replace("audio.headers.get('location')!","audio.headers.get('location')");
function setup({active=true,validAuth=true}={}){
 const rows={callcenter_transcripts:[],team_permissions:[{user_id:'agent',role:'ADMIN',active,listed:true}],callcenter_profiles:[{user_id:'agent',disabled_at:null}],callcenter_phone_assignments:[{user_id:'agent',phone_number_id:'number'}],callcenter_phone_numbers:[{id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'}],outreach_inbound_settings:[{user_id:'agent',enabled:true,cellphone_number:'+17025550102'}],outreach_inbound_calls:[{user_id:'other',call_sid:'other-call',recording_sid:'RE'+'1'.repeat(32)}]};
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
test('incoming-only token uses the authenticated identity without a personal phone',async()=>{
 const s=setup();s.rows.outreach_inbound_settings=[];
 const result=await s.request('token');assert.equal(result.status,200);assert.equal((await result.json()).token,'test-incoming-token');assert.equal(s.issued().options.identity,identity('agent'));assert.equal(s.issued().grant.options.incomingAllow,true);assert.equal(s.issued().grant.options.outgoingApplicationSid,undefined);
});
test('disabled agents and invalid logins are denied',async()=>{
 const disabled=setup({active:false});assert.equal((await disabled.request('token')).status,403);assert.equal((await disabled.request('save_settings',{voicemail_greeting:'Hello',enabled:true})).status,403);
 const invalid=setup({validAuth:false});assert.equal((await invalid.request('settings')).status,401);assert.equal(invalid.access(),0);
});
test('voicemail settings save without collecting a personal phone and ignore old client phone values',async()=>{
 const s=setup();const result=await s.request('save_settings',{user_id:'other',cellphone_number:'+17025550103',voicemail_greeting:'Hello',enabled:true});
 assert.equal(result.status,200);const saved=s.rows.outreach_inbound_settings[0];assert.equal(saved.user_id,'agent');assert.equal(saved.cellphone_number,null);assert.equal(saved.voicemail_greeting,'Hello');
});
test('Admin app routing supersedes the obsolete per-user disabled toggle',async()=>{
 const s=setup();s.rows.outreach_inbound_settings[0].enabled=false;s.rows.callcenter_profiles[0].phone='+17025550103';
 assert.equal((await s.request('token')).status,200);const data=await (await s.request('settings')).json();assert.equal(data.settings.enabled,true);assert.equal(data.settings.cellphone_number,null);
});
test('legacy settings and profile numbers are never returned as forwarding destinations',async()=>{
 const s=setup();s.rows.callcenter_profiles[0].phone='+17025550103';const data=await (await s.request('settings')).json();
 assert.equal(data.routing_source,'twilio');assert.equal(data.settings.cellphone_number,null);assert.equal((await s.request('token')).status,200);
});
test('an approved assigned Twilio number is still required',async()=>{
 const s=setup();s.rows.callcenter_phone_assignments=[];assert.equal((await s.request('token')).status,403);
});
test('voicemail remains private to its assigned user',async()=>{
 const s=setup();assert.equal((await (await s.request('settings')).json()).calls.length,0);assert.equal((await s.request('play_voicemail',{call_sid:'other-call'})).status,404);
});
test('an empty greeting cannot replace voicemail settings',async()=>{
 const s=setup();assert.equal((await s.request('save_settings',{voicemail_greeting:'',enabled:true})).status,400);
});

test('phone-forwarded assignments return their Admin destination without issuing a browser token',async()=>{
 const s=setup();Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17025550109'});
 const response=await s.request('token');assert.equal(response.status,200);const data=await response.json();assert.equal(data.destination,'forward');assert.equal(data.forward_number,'+17025550109');assert.equal(s.issued(),undefined);
});

test('transcript lookup requires the authenticated incoming owner and exact call SID',async()=>{
 const s=setup(),sid='CA'+'1'.repeat(32);
 s.rows.outreach_inbound_calls.push({user_id:'other',call_sid:sid});
 s.rows.callcenter_transcripts.push({user_id:'other',call_sid:sid,transcript:'Private'});
 assert.equal((await s.request('transcript',{call_sid:sid,user_id:'other'})).status,404);
 assert.equal((await s.request('transcript',{call_sid:'bad'})).status,400);
 s.rows.outreach_inbound_calls[1].user_id='agent';s.rows.callcenter_transcripts[0].user_id='agent';
 assert.equal((await (await s.request('transcript',{call_sid:sid})).json()).transcript.transcript,'Private');
});
