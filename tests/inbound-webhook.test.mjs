import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as routing from '../supabase/functions/twilio-inbound/routing.mjs';
const source=(await readFile(new URL('../supabase/functions/twilio-inbound/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/:(?:string|any)\b/g,'');
const account='AC'+'a'.repeat(32),parent='CA'+'1'.repeat(32),child='CA'+'2'.repeat(32),base='https://example.supabase.co/functions/v1/twilio-inbound';
function setup(){
 const rows={callcenter_phone_numbers:[{id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'}],callcenter_phone_assignments:[{phone_number_id:'number',user_id:'agent'}],team_permissions:[{user_id:'agent',role:'ADMIN',active:true,listed:true}],callcenter_profiles:[{user_id:'agent',disabled_at:null}],outreach_inbound_settings:[{user_id:'agent',enabled:true,cellphone_number:'+17025550102',voicemail_greeting:'Business greeting'}],outreach_inbound_push_subscriptions:[],outreach_inbound_devices:[],callcenter_transcripts:[],outreach_inbound_calls:[]};
 const writes=[],pushes=[],deleted=[];let failTranscript=false,pushError=null;
 const db={async rpc(name,args){writes.push({name,args});if(failTranscript)return {error:{message:'missing migration'}};rows.callcenter_transcripts.push({id:'transcript',call_sid:args.p_call_sid});return {error:null}},from(table){let filters=[],patch=null,insert=null,removing=false;const q={select(){return q},delete(){removing=true;return q},limit(){return q},eq(k,v){filters.push([k,v]);return q},update(v){patch=v;return q},upsert(v){insert=v;return q},maybeSingle(){return run(false)},single(){return run(true)},then(resolve,reject){return run('many').then(resolve,reject)}};
  async function run(single){if(insert&&!rows[table].some(x=>x.call_sid===insert.call_sid))rows[table].push({status:'ringing',cellphone_accepted:false,...insert});const found=rows[table].filter(row=>filters.every(([k,v])=>row[k]===v));if(patch)found.forEach(x=>Object.assign(x,patch));if(removing){found.forEach(x=>deleted.push(x.endpoint));rows[table]=rows[table].filter(x=>!found.includes(x));}return {data:structuredClone(single==='many'?found:found[0]||null),error:single===true&&!found.length?{message:'not found'}:null};}return q;
 }};
 let handler,dbAccess=0;
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-key',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'test-token',TWILIO_INBOUND_WEBHOOK_URL:base};
 vm.runInNewContext(source,{...routing,URL,URLSearchParams,Response,Date,webpush:{async sendNotification(subscription,payload,options){pushes.push({subscription,payload:JSON.parse(payload),options});if(pushError)throw pushError;}},console:{error(){}},createClient(){dbAccess++;return db},twilio:{validateRequest:(_token,signature)=>signature==='valid'},Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn}}});
 const request=(stage='incoming',form={},query='',signature='valid')=>handler(new Request(base+(stage==='incoming'?'':'?stage='+stage+query),{method:'POST',headers:{'X-Twilio-Signature':signature,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({AccountSid:account,CallSid:parent,To:'+17025550101',From:'+17025550103',...form})}));
 return {request,rows,writes,env,pushes,deleted,setPushError:error=>{pushError=error},failTranscript:()=>{failTranscript=true},access:()=>dbAccess};
}
test('signed calls ring Outreach without saved routing or a personal number',async()=>{
 const s=setup();s.rows.outreach_inbound_settings=[];assert.match(await (await s.request()).text(),/<Client>/);
 const xml=await (await s.request('browser-ended',{DialCallStatus:'no-answer'})).text();assert.match(xml,/<Record /);assert.doesNotMatch(xml,/<Number/);
});
test('busy, failed and unanswered browser calls go straight to voicemail despite legacy cellphone',async()=>{
 for(const status of ['busy','failed','no-answer','canceled']){
  const s=setup();s.rows.callcenter_profiles[0].phone='+17025550104';await s.request();
  const xml=await (await s.request('browser-ended',{DialCallStatus:status})).text();assert.match(xml,/<Record /);assert.doesNotMatch(xml,/<Number/);
 }
});
test('successful browser conversation hangs up without voicemail',async()=>{
 const s=setup();await s.request();const xml=await (await s.request('browser-ended',{DialCallStatus:'completed'})).text();assert.doesNotMatch(xml,/<Number|<Record/);assert.equal(s.rows.outreach_inbound_calls[0].answered_via,'outreach');
});
test('Admin app destination rings despite a legacy per-user disabled setting',async()=>{
 const s=setup();s.rows.outreach_inbound_settings[0].enabled=false;const xml=await (await s.request()).text();assert.match(xml,/<Client>/);assert.doesNotMatch(xml,/<Number/);
});
test('stale cellphone callbacks cannot accept or bridge a personal-number leg',async()=>{
 const s=setup();await s.request();for(const stage of ['screen','accept-cell']){
  const xml=await (await s.request(stage,{CallSid:child,Digits:'1'},'&parent='+parent)).text();assert.match(xml,/<Hangup/);assert.doesNotMatch(xml,/<Number|<Gather/);
 }
 assert.equal(s.rows.outreach_inbound_calls[0].cellphone_accepted,false);
});
test('invalid signature and wrong account are denied before database reads',async()=>{
 const s=setup();assert.equal((await s.request('incoming',{},'','invalid')).status,403);assert.equal((await s.request('incoming',{AccountSid:'other'})).status,403);assert.equal(s.access(),0);
});
test('disabled numbers cannot create incoming records',async()=>{
 const s=setup();s.rows.callcenter_phone_numbers[0].active=false;assert.doesNotMatch(await (await s.request()).text(),/<Client>/);assert.equal(s.rows.outreach_inbound_calls.length,0);
});
test('completed recordings stay attached to the original incoming call',async()=>{
 const s=setup();await s.request();await s.request('recorded',{RecordingStatus:'completed',RecordingSid:'RE'+'3'.repeat(32),RecordingDuration:'12'});
 assert.equal(s.rows.outreach_inbound_calls[0].status,'voicemail');assert.equal(s.rows.outreach_inbound_calls[0].recording_duration,12);
});

test('Admin Phone forwarding rings only its explicit number and snapshots that destination',async()=>{
 const s=setup();Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17025550109'});
 const xml=await (await s.request()).text();assert.match(xml,/>\+17025550109<\/Number>/);assert.doesNotMatch(xml,/<Client>/);
 assert.equal(s.rows.outreach_inbound_calls[0].route_destination,'forward');assert.equal(s.rows.outreach_inbound_calls[0].forward_number,'+17025550109');
 // Admin edits apply to later calls, not this active phone leg.
 s.rows.callcenter_phone_numbers[0].inbound_destination='app';
 const screen=await (await s.request('screen',{CallSid:child},'&parent='+parent)).text();assert.match(screen,/Press 1/);
 await s.request('accept-cell',{CallSid:child,Digits:'1'},'&parent='+parent);
 const ended=await (await s.request('phone-ended',{DialCallStatus:'completed'})).text();assert.doesNotMatch(ended,/<Record/);assert.equal(s.rows.outreach_inbound_calls[0].answered_via,'phone');
});
test('unaccepted forwarding answers and failed calls go to business voicemail',async()=>{
 for(const status of ['completed','no-answer','busy','failed']){
  const s=setup();Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17025550109'});await s.request();
  assert.match(await (await s.request('phone-ended',{DialCallStatus:status})).text(),/<Record /);
 }
});
test('forwarding routes reject self, unavailable managed, and malformed destinations without placing a call',async()=>{
 for(const forward of ['+17025550101','invalid','+17025550108']){
  const s=setup();s.rows.callcenter_phone_numbers.push({id:'managed',phone_number:'+17025550108'});Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:forward});
  const response=await s.request();assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/<Number|<Client>/);assert.equal(s.rows.outreach_inbound_calls.length,0);
 }
});
function addManaged(s, number, forward=null){
 const id='managed-'+number;
 s.rows.callcenter_phone_numbers.push({id,phone_number:number,active:true,twilio_status:'ready',inbound_destination:forward?'forward':'app',inbound_forward_number:forward});
 s.rows.callcenter_phone_assignments.push({phone_number_id:id,user_id:'kiara'});
 s.rows.team_permissions.push({user_id:'kiara',role:'SALES',active:true,listed:true});
 s.rows.callcenter_profiles.push({user_id:'kiara',disabled_at:null});
}
test('an unassigned line can forward externally with private unattributed call history',async()=>{
 const s=setup();s.rows.callcenter_phone_assignments=[];
 Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17025550109'});
 assert.match(await (await s.request()).text(),/>\+17025550109<\/Number>/);
 assert.equal(s.rows.outreach_inbound_calls[0].user_id,null);
 assert.match(await (await s.request('phone-ended',{DialCallStatus:'no-answer'})).text(),/<Record /);
});
test('managed forwarding rings the destination owner directly and preserves the original incoming number',async()=>{
 const s=setup();addManaged(s,'+17023726399');
 Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17023726399'});
 const xml=await (await s.request()).text();assert.match(xml,/<Identity>sh_inbound_kiara<\/Identity>/);assert.doesNotMatch(xml,/<Number|<Gather/);
 assert.equal(s.rows.outreach_inbound_calls[0].user_id,'kiara');assert.equal(s.rows.outreach_inbound_calls[0].to_number,'+17025550101');
 // Assignment/routing edits cannot redirect callbacks for the existing call.
 s.rows.callcenter_phone_assignments[1].user_id='someone-else';
 assert.match(await (await s.request('browser-ended',{DialCallStatus:'no-answer'})).text(),/<Record /);
});
test('managed forwarding chains resolve to the final external number with one screening step',async()=>{
 const s=setup();addManaged(s,'+17023726399','+17025550109');
 Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17023726399'});
 const xml=await (await s.request()).text();assert.match(xml,/>\+17025550109<\/Number>/);assert.doesNotMatch(xml,/>\+17023726399<\/Number>/);
 assert.equal(s.rows.outreach_inbound_calls[0].user_id,'kiara');
});
test('cycles and unavailable or ineligible terminal owners never place a call',async()=>{
 for(const failure of ['cycle','disabled','pending','unassigned','revoked']){
  const s=setup();addManaged(s,'+17023726399',failure==='cycle'?'+17025550101':null);
  Object.assign(s.rows.callcenter_phone_numbers[0],{inbound_destination:'forward',inbound_forward_number:'+17023726399'});
  if(failure==='disabled')s.rows.callcenter_phone_numbers[1].active=false;
  if(failure==='pending')s.rows.callcenter_phone_numbers[1].twilio_status='pending';
  if(failure==='unassigned')s.rows.callcenter_phone_assignments.pop();
  if(failure==='revoked')s.rows.team_permissions[1].active=false;
  const xml=await (await s.request()).text();assert.doesNotMatch(xml,/<Number|<Client>/);assert.equal(s.rows.outreach_inbound_calls.length,0);
 }
});


test('inbound transcription uses the original parent and stops before voicemail',async()=>{
 const s=setup();const xml=await (await s.request()).text();
 assert(xml.indexOf('<Start>')<xml.indexOf('<Dial '));
 assert.match(xml,/inboundTrackLabel="customer" outboundTrackLabel="agent"/);
 assert.match(xml,new RegExp('name="parentCallSid" value="'+parent+'"'));
 assert.equal(s.writes[0].name,'outreach_start_inbound_transcript');assert.equal(s.writes[0].args.p_call_sid,parent);
 const ended=await (await s.request('browser-ended',{DialCallStatus:'no-answer'})).text();
 assert(ended.indexOf('<Stop>')<ended.indexOf('<Say>'));
});
test('transcription initialization failure never blocks app reception or voicemail',async()=>{
 const s=setup();s.failTranscript();const response=await s.request();assert.equal(response.status,200);
 const xml=await response.text();assert.match(xml,/<Client>/);assert.doesNotMatch(xml,/<Start>/);
 const ended=await (await s.request('browser-ended',{DialCallStatus:'no-answer'})).text();assert.match(ended,/<Record /);assert.doesNotMatch(ended,/<Stop>/);
});

function enablePush(s){
 Object.assign(s.env,{WEB_PUSH_VAPID_PUBLIC_KEY:'public',WEB_PUSH_VAPID_PRIVATE_KEY:'private',WEB_PUSH_VAPID_SUBJECT:'mailto:admin@example.com'});
 s.rows.outreach_inbound_push_subscriptions.push({user_id:'agent',enabled:true,endpoint:'https://web.push.apple.com/test',p256dh:'key',auth:'auth'},{user_id:'agent',enabled:false,endpoint:'https://fcm.googleapis.com/disabled'},{user_id:'other',enabled:true,endpoint:'https://fcm.googleapis.com/other'});
}
test('closed PWA receives owner-only enabled push and caller waits until browser registers',async()=>{
 const s=setup();enablePush(s);const first=await (await s.request()).text();assert.match(first,/<Redirect method="POST">/);assert.doesNotMatch(first,/<Client>|<Start>/);
 assert.equal(s.pushes.length,1);assert.equal(s.pushes[0].payload.kind,'incoming-call');assert.equal(s.pushes[0].payload.call_sid,parent);assert.equal(s.pushes[0].options.TTL,60);assert.equal(s.pushes[0].options.urgency,'high');
 assert.equal(s.pushes[0].payload.body.includes('+1702'),false);
 s.rows.outreach_inbound_devices.push({user_id:'agent',ready:true,updated_at:new Date().toISOString()});
 const resumed=await (await s.request('wait')).text();assert.match(resumed,/<Client>/);assert.match(resumed,/<Start>/);assert.equal(s.pushes.length,1);
});
test('failed offline dial waits for fresh readiness without restarting transcription',async()=>{
 const s=setup();enablePush(s);s.rows.outreach_inbound_devices.push({user_id:'agent',ready:true,updated_at:new Date().toISOString()});
 assert.match(await (await s.request()).text(),/<Start>/);
 const failed=await (await s.request('browser-ended',{DialCallStatus:'failed'})).text();assert.match(failed,/<Redirect/);assert.doesNotMatch(failed,/<Stop>|<Record/);
 s.rows.outreach_inbound_devices[0].updated_at=new Date(Date.now()+10).toISOString();
 const retry=await (await s.request('wait')).text();assert.match(retry,/<Client>/);assert.doesNotMatch(retry,/<Start>/);
});
test('expired push wait and explicitly alerted unanswered calls reach voicemail',async()=>{
 for(const expired of [true,false]){
  const s=setup();enablePush(s);await s.request();const call=s.rows.outreach_inbound_calls[0];
  if(expired){call.push_wait_until=new Date(Date.now()-1000).toISOString();assert.match(await (await s.request('wait')).text(),/<Record /);}
  else {call.browser_attempted_at=new Date(Date.now()-100).toISOString();call.browser_alerted_at=new Date().toISOString();assert.match(await (await s.request('browser-ended',{DialCallStatus:'no-answer'})).text(),/<Record /);}
 }
});
test('expired push endpoints are pruned without failing call routing',async()=>{
 const s=setup();enablePush(s);s.setPushError({statusCode:410});const response=await s.request();assert.equal(response.status,200);assert.equal(s.deleted.length,1);assert.equal(s.deleted[0],'https://web.push.apple.com/test');
});
