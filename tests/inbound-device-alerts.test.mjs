import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../inbound-calling.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({forward=false,permission='granted',off=false,tokenResult=null,transcriptResult=null,realtime=false,pushSupport=false,presence=false,microphone=async()=>({getTracks:()=>[{stop(){}}]})}={}){
 const nodes=new Map(),events={},posts=[],devices=[],notices=[],requests=[],bodies=[],registrations=[],prefs=new Map([['steadyhands-setting-device-notifications','true']]);let micCalls=0,permissionCalls=0;const intervals=new Map(),emitted=[],channels=[],removed=[];let intervalId=0;
 if(off)prefs.set('steadyhands-incoming-off-agent','true');
 const node=()=>({hidden:false,disabled:false,textContent:'',value:'',dataset:{},checked:false,classList:{add(){},remove(){}},setAttribute(){},append(){},replaceChildren(){},scrollIntoView(){},focus(){this.focused=true},querySelector(selector){const id=selector.slice(1);if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)}});
 class Device{constructor(token){this.handlers={};devices.push(this)}on(name,fn){this.handlers[name]=fn}async register(){this.handlers.registered()}async unregister(){this.handlers.unregistered()}destroy(){this.destroyed=true}updateToken(){}}
 class Notice{static permission=permission;static async requestPermission(){permissionCalls++;return 'granted'}constructor(title,options){this.title=title;this.options=options;notices.push(this)}close(){this.closed=true}}
 const document={title:'Outreach',hidden:false,head:{append(){}},body:{append(){}},createElement:node,addEventListener:(name,fn)=>events[name]=fn};
 const client={
  auth:{getUser:async()=>({data:{user:{id:'agent'}}}),onAuthStateChange:fn=>events.auth=fn},
  functions:{invoke:async(name,{body})=>{
   requests.push(body.action);bodies.push(body);
   if(body.action==='push_config')return {data:{configured:true,public_key:Buffer.alloc(65,1).toString('base64url')}};
   if(body.action==='transcript')return {data:{transcript:typeof transcriptResult==='function'?await transcriptResult():transcriptResult}};
   if(body.action==='token'&&tokenResult)return {data:await tokenResult};
   const data=body.action==='token'
    ? (forward?{destination:'forward',number:'+17025550101',forward_number:'+17025550109'}:{token:'incoming',number:'+17025550101'})
    : {settings:{enabled:true},calls:[]};
   return {data};
  }}
 };
 if(realtime){client.channel=()=>{const channel={on(_event,filter,fn){this.filter=filter;this.receive=fn;return this},subscribe(fn){this.status=fn;return this}};channels.push(channel);return channel};client.removeChannel=channel=>{removed.push(channel)};}
 const window={dispatchEvent:event=>emitted.push(event),Notification:Notice,focus(){this.focused=true},addEventListener:(name,fn)=>events[name]=fn,steadyHandsCRMClient:client};
 const serviceWorker={controller:{postMessage:message=>posts.push(message)},addEventListener:(name,fn)=>events['worker-'+name]=fn};
 let subscription=null,unsubscribed=0;
 if(pushSupport){
  window.PushManager=class{};
  const registration={active:{},getNotifications:async()=>[],pushManager:{getSubscription:async()=>subscription,subscribe:async options=>{
   subscription={endpoint:'https://web.push.apple.com/test',options,toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}),unsubscribe:async()=>{unsubscribed++;subscription=null;return true}};return subscription;
  }}};
  serviceWorker.register=async(url,options)=>{registrations.push({url,options});return registration};serviceWorker.getRegistration=async()=>registration;
 }
 vm.runInNewContext(source,{atob,Uint8Array,crypto:presence?{randomUUID:()=> '11111111-2222-3333-4444-555555555555'}:undefined,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId},clearInterval:id=>intervals.delete(id),window,document,Device,Notification:Notice,navigator:{serviceWorker,mediaDevices:{getUserMedia:async()=>{micCalls++;return microphone()}}},localStorage:{getItem:k=>prefs.get(k)||null,setItem:(k,v)=>prefs.set(k,v)},setTimeout:()=>1,clearTimeout(){},console:{warn(){}}});await tick();
 const incoming=()=>{const handlers={};const call={handlers,parameters:{From:'+17025550103',CallSid:'CA'+'2'.repeat(32)},customParameters:new Map([['parentCallSid','CA'+'1'.repeat(32)]]),on:(name,fn)=>handlers[name]=fn,async accept(){call.accepted=true;handlers.accept()},reject(){call.rejected=true;handlers.reject?.()},disconnect(){handlers.disconnect()}};devices[0].handlers.incoming(call);return call};
 return {bodies,registrations,unsubscribed:()=>unsubscribed,channels,removed,intervals,emitted,nodes,events,posts,devices,notices,requests,window,document,prefs,incoming,micCalls:()=>micCalls,permissionCalls:()=>permissionCalls};
}
test('signed-in app registers automatically without microphone or notification permission prompts',async()=>{
 const s=await setup();assert.equal(s.devices.length,1);assert.equal(s.micCalls(),0);assert.equal(s.permissionCalls(),0);assert.match(s.nodes.get('inboundStatus').textContent,/Ready for incoming/);
});
test('incoming call shows Answer/Decline and a device alert; permission is requested only on Answer',async()=>{
 const s=await setup(),call=s.incoming();assert.equal(s.nodes.get('inboundActive').hidden,false);assert.equal(s.nodes.get('inboundAnswer').hidden,false);assert.equal(s.notices.length,1);assert.match(s.notices[0].options.body,/17025550103/);
 assert.equal(s.micCalls(),0);await s.nodes.get('inboundAnswer').onclick();assert(call.accepted);assert.equal(s.micCalls(),1);assert.equal(s.nodes.get('inboundEnd').hidden,false);assert(s.notices[0].closed);
});
test('notification click focuses the existing app and cancel produces a missed-call notice',async()=>{
 const s=await setup(),call=s.incoming();s.notices[0].onclick();assert.equal(s.window.focused,true);
 call.handlers.cancel();assert.equal(s.nodes.get('inboundActive').hidden,true);assert.equal(s.nodes.get('inboundToggle').textContent,'Missed call');assert.equal(s.notices.at(-1).title,'Missed incoming call');
});
test('blocked notifications do not stop the in-app call alert',async()=>{
 const s=await setup({permission:'denied'});s.incoming();assert.equal(s.notices.length,0);assert.equal(s.nodes.get('inboundActive').hidden,false);
});
test('Admin Phone forwarding avoids browser registration and shows its destination',async()=>{
 const s=await setup({forward:true});assert.equal(s.devices.length,0);assert.match(s.nodes.get('inboundStatus').textContent,/Phone forwarding.*17025550109/);
});
test('device offline preference persists and manual reconnect enables reception',async()=>{
 const s=await setup({off:true});assert.equal(s.devices.length,0);await s.nodes.get('inboundEnable').onclick();assert.equal(s.devices.length,1);assert.equal(s.prefs.get('steadyhands-incoming-off-agent'),'false');
});
test('a cancelled call cannot be accepted after a slow microphone permission response',async()=>{
 let resolve;const s=await setup({microphone:()=>new Promise(r=>resolve=r)}),call=s.incoming();const answer=s.nodes.get('inboundAnswer').onclick();call.handlers.cancel();resolve({getTracks:()=>[]});await answer;assert.equal(call.accepted,undefined);
});

test('sign-out destroys reception and clears active call UI',async()=>{
 const s=await setup();s.incoming();s.events.auth('SIGNED_OUT',null);assert(s.devices[0].destroyed);assert.equal(s.nodes.get('inboundActive').hidden,true);assert.equal(s.window.SteadyHandsInboundVoice.isActive(),false);
});
test('sign-out during token loading cannot register the old account afterward',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const s=await setup({tokenResult:pending});
 s.events.auth('SIGNED_OUT',null);resolve({token:'old-user',number:'+17025550101'});await tick();assert.equal(s.devices.length,0);
});

test('busy outbound calls remain uninterrupted and receive a missed-call alert',async()=>{
 const s=await setup();s.window.SteadyHandsTwilioVoice={isActive:()=>true};const call=s.incoming();
 assert(call.rejected);assert.equal(call.accepted,undefined);assert.equal(s.window.SteadyHandsInboundVoice.isActive(),false);assert.equal(s.nodes.get('inboundToggle').textContent,'Missed call · Busy');assert.equal(s.notices[0].title,'Missed incoming call');
});

test('accepted inbound calls fetch by parent SID and preserve final transcript after hangup',async()=>{
 const s=await setup({transcriptResult:{transcript:'You: Hello\nProspect: Hi',transcription_status:'active'}});
 const call=s.incoming();await s.nodes.get('inboundAnswer').onclick();await tick();
 assert.equal(s.nodes.get('inboundTranscriptText').value,'You: Hello\nProspect: Hi');
 assert(s.requests.includes('transcript'));assert.equal(s.emitted.find(e=>e.detail.started).detail.callSid,'CA'+'1'.repeat(32));
 call.disconnect();assert.equal(s.intervals.size,1);assert.equal(s.nodes.get('inboundTranscriptPanel').hidden,false);
 s.events.auth('SIGNED_OUT',null);assert.equal(s.intervals.size,0);assert.equal(s.nodes.get('inboundTranscriptText').value,'');
});
test('late transcript responses cannot restore private text after sign-out',async()=>{
 let resolve;const s=await setup({transcriptResult:()=>new Promise(r=>resolve=r)});s.incoming();
 await s.nodes.get('inboundAnswer').onclick();s.events.auth('SIGNED_OUT',null);
 resolve({transcript:'Old private text'});await tick();assert.equal(s.nodes.get('inboundTranscriptText').value,'');
});

test('Realtime shows provisional text immediately, rejects stale snapshots, and unsubscribes at sign-out',async()=>{
 const s=await setup({realtime:true,transcriptResult:{transcript:'',transcript_revision:0}});s.incoming();await s.nodes.get('inboundAnswer').onclick();await tick();
 const channel=s.channels[0],sid='CA'+'1'.repeat(32);assert.equal(channel.filter.filter,'call_sid=eq.'+sid);
 channel.receive({new:{call_sid:sid,transcript_revision:2,interim_segments:{customer:{speaker:'customer',text:'Not really interested',final:false}}}});
 assert.match(s.nodes.get('inboundTranscriptText').value,/Prospect \(speaking…\): Not really interested/);
 assert.equal(s.emitted.at(-1).detail.transcript.transcript,undefined);
 channel.receive({new:{call_sid:sid,transcript_revision:1,transcript:'Stale'}});assert.doesNotMatch(s.nodes.get('inboundTranscriptText').value,/Stale/);
 channel.receive({new:{call_sid:sid,transcript_revision:3,transcript:'Prospect: Not interested',interim_segments:{}}});assert.equal(s.nodes.get('inboundTranscriptText').value,'Prospect: Not interested');
 s.events.auth('SIGNED_OUT',null);assert.equal(s.removed[0],channel);
 channel.receive({new:{call_sid:sid,transcript_revision:4,transcript:'Private'}});assert.equal(s.nodes.get('inboundTranscriptText').value,'');
});

test('device alert enrollment creates a separate push scope and disabling unsubscribes it',async()=>{
 const s=await setup({pushSupport:true});await s.nodes.get('inboundAlerts').onclick();
 assert.equal(s.registrations[0].url,'/call-push-sw.js');assert.equal(s.registrations[0].options.scope,'/call-push/');
 assert(s.requests.includes('push_subscribe'));assert.equal(s.prefs.get('steadyhands-call-push-agent'),'true');assert.match(s.nodes.get('inboundAlertStatus').textContent,/Closed-app call alerts enabled/);
 await s.nodes.get('inboundAlertsOff').onclick();assert(s.requests.includes('push_disable'));assert.equal(s.unsubscribed(),1);assert.equal(s.prefs.get('steadyhands-call-push-agent'),'false');
});
test('ready registration advertises the device and a notification wake refreshes readiness',async()=>{
 const s=await setup({presence:true});assert(s.bodies.some(body=>body.action==='device_ready'&&body.ready===true));
 const before=s.bodies.filter(body=>body.action==='device_ready').length;s.events['worker-message']({data:{type:'steadyhands:incoming-wake'}});await tick();
 assert.equal(s.bodies.filter(body=>body.action==='device_ready').length,before+1);
 s.events.pagehide();await tick();assert(s.bodies.some(body=>body.action==='device_ready'&&body.ready===false));
});
test('denied device permission never creates a push subscription',async()=>{
 const s=await setup({permission:'denied',pushSupport:true});await s.nodes.get('inboundAlerts').onclick();assert.equal(s.registrations.length,0);assert(!s.requests.includes('push_subscribe'));
});

test('sign-out invalidates the dedicated call push endpoint on that device',async()=>{
 const s=await setup({pushSupport:true});await s.nodes.get('inboundAlerts').onclick();s.events.auth('SIGNED_OUT',null);await tick();assert.equal(s.unsubscribed(),1);assert.equal(s.prefs.get('steadyhands-call-push-agent'),'false');
});
