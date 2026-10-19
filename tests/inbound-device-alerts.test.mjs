import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../inbound-calling.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({forward=false,permission='granted',off=false,tokenResult=null,transcriptResult=null,microphone=async()=>({getTracks:()=>[{stop(){}}]})}={}){
 const nodes=new Map(),events={},posts=[],devices=[],notices=[],requests=[],prefs=new Map([['steadyhands-setting-device-notifications','true']]);let micCalls=0,permissionCalls=0;const intervals=new Map(),emitted=[];let intervalId=0;
 if(off)prefs.set('steadyhands-incoming-off-agent','true');
 const node=()=>({hidden:false,disabled:false,textContent:'',value:'',dataset:{},checked:false,classList:{add(){},remove(){}},setAttribute(){},append(){},replaceChildren(){},scrollIntoView(){},focus(){this.focused=true},querySelector(selector){const id=selector.slice(1);if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)}});
 class Device{constructor(token){this.handlers={};devices.push(this)}on(name,fn){this.handlers[name]=fn}async register(){this.handlers.registered()}async unregister(){this.handlers.unregistered()}destroy(){this.destroyed=true}updateToken(){}}
 class Notice{static permission=permission;static async requestPermission(){permissionCalls++;return 'granted'}constructor(title,options){this.title=title;this.options=options;notices.push(this)}close(){this.closed=true}}
 const document={title:'Outreach',hidden:false,head:{append(){}},body:{append(){}},createElement:node,addEventListener:(name,fn)=>events[name]=fn};
 const client={
  auth:{getUser:async()=>({data:{user:{id:'agent'}}}),onAuthStateChange:fn=>events.auth=fn},
  functions:{invoke:async(name,{body})=>{
   requests.push(body.action);
   if(body.action==='transcript')return {data:{transcript:typeof transcriptResult==='function'?await transcriptResult():transcriptResult}};
   if(body.action==='token'&&tokenResult)return {data:await tokenResult};
   const data=body.action==='token'
    ? (forward?{destination:'forward',number:'+17025550101',forward_number:'+17025550109'}:{token:'incoming',number:'+17025550101'})
    : {settings:{enabled:true},calls:[]};
   return {data};
  }}
 };
 const window={dispatchEvent:event=>emitted.push(event),Notification:Notice,focus(){this.focused=true},addEventListener:(name,fn)=>events[name]=fn,steadyHandsCRMClient:client};
 const serviceWorker={controller:{postMessage:message=>posts.push(message)},addEventListener:(name,fn)=>events['worker-'+name]=fn};
 vm.runInNewContext(source,{CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId},clearInterval:id=>intervals.delete(id),window,document,Device,Notification:Notice,navigator:{serviceWorker,mediaDevices:{getUserMedia:async()=>{micCalls++;return microphone()}}},localStorage:{getItem:k=>prefs.get(k)||null,setItem:(k,v)=>prefs.set(k,v)},setTimeout:()=>1,clearTimeout(){},console:{warn(){}}});await tick();
 const incoming=()=>{const handlers={};const call={handlers,parameters:{From:'+17025550103',CallSid:'CA'+'2'.repeat(32)},customParameters:new Map([['parentCallSid','CA'+'1'.repeat(32)]]),on:(name,fn)=>handlers[name]=fn,async accept(){call.accepted=true;handlers.accept()},reject(){call.rejected=true;handlers.reject?.()},disconnect(){handlers.disconnect()}};devices[0].handlers.incoming(call);return call};
 return {intervals,emitted,nodes,events,posts,devices,notices,requests,window,document,prefs,incoming,micCalls:()=>micCalls,permissionCalls:()=>permissionCalls};
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
