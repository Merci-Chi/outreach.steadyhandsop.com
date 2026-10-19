import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {identity} from '../supabase/functions/twilio-inbound/routing.mjs';
const source=(await readFile(new URL('../supabase/functions/twilio-inbound-session/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/:(?:any|Response|string)\b/g,'').replace("audio.headers.get('location')!","audio.headers.get('location')");
function setup({active=true,validAuth=true}={}){
 const rows={outreach_inbound_push_subscriptions:[],outreach_inbound_devices:[],callcenter_transcripts:[],team_permissions:[{user_id:'agent',role:'ADMIN',active,listed:true}],callcenter_profiles:[{user_id:'agent',disabled_at:null}],callcenter_phone_assignments:[{user_id:'agent',phone_number_id:'number'}],callcenter_phone_numbers:[{id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'}],outreach_inbound_settings:[{user_id:'agent',enabled:true,cellphone_number:'+17025550102'}],outreach_inbound_calls:[{user_id:'other',call_sid:'other-call',recording_sid:'RE'+'1'.repeat(32)}]};
 let issued,handler,dbAccess=0,pushError=null;const pushes=[];
 const db={rpc:async()=>({data:{is_paused:!!env.PAUSED}}),auth:{getUser:async()=>validAuth?{data:{user:{id:'agent'}}}:{error:{message:'bad token'}}},from(table){
  dbAccess++;let filters=[],insert=null,patch=null,conflict='user_id';const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},update(v){patch=v;return q},upsert(v,options){insert=v;conflict=options?.onConflict||'user_id';return q},maybeSingle:()=>run(true),then:(resolve,reject)=>run(false).then(resolve,reject)};
  async function run(single){if(insert){const old=rows[table].find(x=>conflict.split(',').every(k=>x[k]===insert[k]));if(old)Object.assign(old,insert);else rows[table].push(insert);}const result=rows[table].filter(x=>filters.every(([k,v])=>x[k]===v));if(patch)result.forEach(row=>Object.assign(row,patch));return {data:structuredClone(single?result[0]||null:result)};}return q;
 }};
 class AccessToken{static VoiceGrant=class{constructor(options){this.options=options}};constructor(_a,_k,_s,options){this.options=options;issued=this;}addGrant(grant){this.grant=grant}toJwt(){return 'test-incoming-token'}}
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',TWILIO_ACCOUNT_SID:'test',TWILIO_AUTH_TOKEN:'test',TWILIO_API_KEY_SID:'test',TWILIO_API_KEY_SECRET:'test'};
 vm.runInNewContext(source,{webpush:{async sendNotification(subscription,payload,options){pushes.push({subscription,payload:JSON.parse(payload),options});if(pushError)throw pushError;}},identity,URL,Uint8Array,String,Response,btoa,console:{error(){}},createClient:()=>db,twilio:{jwt:{AccessToken}},Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn}}});
 const request=(action,body={})=>handler(new Request('https://example.supabase.co/functions/v1/twilio-inbound-session',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action,...body})}));
 return {pushes,setPushError:error=>{pushError=error},rows,request,env,issued:()=>issued,access:()=>dbAccess};
}
test('incoming-only token uses the authenticated identity without a personal phone',async()=>{
 const s=setup();s.rows.outreach_inbound_settings=[];
 const result=await s.request('token');assert.equal(result.status,200);assert.equal((await result.json()).token,'test-incoming-token');assert.equal(s.issued().options.identity,identity('agent'));assert.equal(s.issued().grant.options.incomingAllow,true);assert.equal(s.issued().grant.options.outgoingApplicationSid,undefined);
});
test('disabled agents and invalid logins are denied',async()=>{
 const disabled=setup({active:false});assert.equal((await disabled.request('token')).status,403);assert.equal((await disabled.request('save_settings',{voicemail_greeting:'Hello',enabled:true})).status,403);
 const invalid=setup({validAuth:false});assert.equal((await invalid.request('settings')).status,401);assert.equal(invalid.access(),0);
});
test('legacy Outreach clients cannot change voicemail greetings',async()=>{
 const s=setup(),before=structuredClone(s.rows.outreach_inbound_settings);
 const response=await s.request('save_settings',{voicemail_greeting:'Unauthorized change',enabled:true});
 assert.equal(response.status,403);assert.match((await response.json()).error,/Admin → Phone Numbers/);
 assert.deepEqual(s.rows.outreach_inbound_settings,before);
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
 const s=setup();assert.equal((await s.request('save_settings',{voicemail_greeting:'',enabled:true})).status,403);
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

const pushSubscription=endpoint=>({endpoint,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}});
function pushKeys(s){Object.assign(s.env,{WEB_PUSH_VAPID_PUBLIC_KEY:'public',WEB_PUSH_VAPID_PRIVATE_KEY:'private',WEB_PUSH_VAPID_SUBJECT:'mailto:admin@example.com'});}
test('push enrollment supports Apple, Google, Mozilla and Windows endpoints and uses authenticated owner',async()=>{
 const s=setup();pushKeys(s);
 for(const host of ['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','wns.notify.windows.com']){
  const response=await s.request('push_subscribe',{user_id:'other',subscription:pushSubscription('https://'+host+'/test')});assert.equal(response.status,200);
 }
 assert.equal(s.rows.outreach_inbound_push_subscriptions.length,4);assert(s.rows.outreach_inbound_push_subscriptions.every(row=>row.user_id==='agent'&&row.enabled));
 const config=await (await s.request('push_config')).json();assert.equal(config.public_key,'public');assert.equal(config.private_key,undefined);
});
test('push enrollment rejects internal URLs, unknown hosts, non-HTTPS endpoints and malformed keys',async()=>{
 const s=setup();pushKeys(s);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://example.com/a','https://web.push.apple.com.evil.example/a','https://user@web.push.apple.com/a','https://fcm.googleapis.com:444/a'])assert.equal((await s.request('push_subscribe',{subscription:pushSubscription(endpoint)})).status,400);
 const subscription=pushSubscription('https://web.push.apple.com/test');subscription.keys.auth='bad';assert.equal((await s.request('push_subscribe',{subscription})).status,400);
 assert.equal(s.rows.outreach_inbound_push_subscriptions.length,0);
});
test('push disable and call-received updates cannot modify another user records',async()=>{
 const s=setup();s.rows.outreach_inbound_push_subscriptions.push({user_id:'other',endpoint:'https://web.push.apple.com/test',enabled:true});
 await s.request('push_disable',{endpoint:'https://web.push.apple.com/test',user_id:'other'});assert.equal(s.rows.outreach_inbound_push_subscriptions[0].enabled,true);
 const sid='CA'+'1'.repeat(32);s.rows.outreach_inbound_calls.push({user_id:'other',call_sid:sid,route_destination:'app'});
 await s.request('call_received',{call_sid:sid,user_id:'other'});assert.equal(s.rows.outreach_inbound_calls[1].browser_alerted_at,undefined);
});
test('readiness is tracked independently per device under the authenticated account',async()=>{
 const s=setup();for(const device_id of ['11111111-2222-3333-4444-555555555555','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])assert.equal((await s.request('device_ready',{device_id,ready:true,user_id:'other'})).status,200);
 assert.equal(s.rows.outreach_inbound_devices.length,2);assert(s.rows.outreach_inbound_devices.every(row=>row.user_id==='agent'));
 assert.equal((await s.request('device_ready',{device_id:'bad',ready:true})).status,400);
});

test('device push test reports provider rejection and never sends to another account endpoint',async()=>{
 const s=setup();pushKeys(s);const endpoint='https://web.push.apple.com/test';
 s.rows.outreach_inbound_push_subscriptions.push({endpoint,user_id:'other',enabled:true,p256dh:'key',auth:'auth'});
 assert.equal((await s.request('push_test',{endpoint})).status,404);assert.equal(s.pushes.length,0);
 s.rows.outreach_inbound_push_subscriptions[0].user_id='agent';s.setPushError({statusCode:403});
 const response=await s.request('push_test',{endpoint});assert.equal(response.status,502);assert.match((await response.json()).error,/VAPID/);
 const status=await (await s.request('push_status',{endpoint})).json();assert.equal(status.enrolled,true);assert.match(status.last_error,/VAPID/);
 s.setPushError(null);const accepted=await (await s.request('push_test',{endpoint})).json();assert(accepted.ok);assert.match(accepted.message,/accepted/);assert.equal(s.pushes.at(-1).payload.kind,'call-alert-test');
 assert(s.rows.outreach_inbound_push_subscriptions[0].last_success_at);assert.equal(s.rows.outreach_inbound_push_subscriptions[0].last_error,null);
});

test('paused users receive no incoming token, then regain access when requirements clear',async()=>{
 const s=setup();s.env.PAUSED=true;assert.equal((await s.request('token')).status,403);
 s.env.PAUSED=false;assert.equal((await s.request('token')).status,200);
});
