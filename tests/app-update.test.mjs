import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app-update.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({controlled=true}={}){
 let now=Date.parse('2026-10-19T06:00:00Z'),etag='v1',reloads=0,activeCall=false,hidden=false;
 const handlers={},timeouts=new Map(),intervals=[],session=new Map();let timerId=0;
 class Clock extends Date{static now(){return now}}
 const listen=(name,fn)=>(handlers[name]??=[]).push(fn);
 const registration={update:async()=>{}};
 const navigator={onLine:true,serviceWorker:{controller:controlled?{}:null,register:async()=>registration,getRegistrations:async()=>[registration],addEventListener:listen}};
 const document={lastModified:new Date(now).toUTCString(),readyState:'complete',get hidden(){return hidden},activeElement:null,querySelector:()=>null,addEventListener:listen};
 const window={addEventListener:listen,SteadyHandsTwilioVoice:{isActive:()=>activeCall}};
 const location={pathname:'/index.html',origin:'https://example.com',reload:()=>reloads++};
 vm.runInNewContext(source,{window,navigator,document,location,URL,Date:Clock,Number,Set,Promise,console:{warn(){}},sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},fetch:async()=>({ok:true,headers:{get:name=>name==='etag'?etag:document.lastModified}}),setInterval:(fn,ms)=>intervals.push({fn,ms}),setTimeout:fn=>{timeouts.set(++timerId,fn);return timerId},clearTimeout:id=>timeouts.delete(id)});
 await tick();
 const event=async(name,detail={})=>{for(const fn of handlers[name]||[])fn(detail);await tick()};
 const poll=async()=>{for(const {fn} of intervals)await fn();await tick()};
 const timers=async()=>{const entries=[...timeouts];timeouts.clear();for(const [,fn] of entries)fn();await tick()};
 return {document,window,handlers,intervals,event,poll,timers,advance:ms=>now+=ms,setTag:value=>etag=value,setCall:value=>activeCall=value,setHidden:value=>hidden=value,reloads:()=>reloads};
}
test('periodic deployed-page checks refresh an idle PWA automatically without a button',async()=>{
 const s=await setup();assert.equal(s.intervals[0].ms,60000);s.advance(20000);s.setTag('v2');await s.poll();assert.equal(s.reloads(),1);await s.poll();assert.equal(s.reloads(),1);
});
test('updates wait for an active call to end and for its transcript drain',async()=>{
 const s=await setup();s.advance(20000);s.setCall(true);s.setTag('v2');await s.poll();assert.equal(s.reloads(),0);
 s.setCall(false);await s.event('steadyhands:voice-state',{detail:{state:'ended'}});await s.timers();assert.equal(s.reloads(),0);
 s.advance(36000);await s.timers();assert.equal(s.reloads(),1);
});
test('unsaved form input blocks refresh until a successful save, not merely submission',async()=>{
 const s=await setup(),form={},field={isConnected:true,form,matches:()=>true};
 await s.event('input',{target:field});s.advance(20000);s.setTag('v2');await s.poll();assert.equal(s.reloads(),0);
 await s.event('submit',{target:form});s.advance(16000);await s.timers();assert.equal(s.reloads(),0);
 await s.event('steadyhands:changes-saved',{detail:{form}});assert.equal(s.reloads(),1);
});
test('first worker installation does not reload and hidden apps wait until visible',async()=>{
 const s=await setup({controlled:false});await s.event('controllerchange');assert.equal(s.reloads(),0);
 s.advance(20000);s.setHidden(true);s.setTag('v2');await s.poll();assert.equal(s.reloads(),0);
 s.setHidden(false);await s.event('visibilitychange');assert.equal(s.reloads(),0);s.advance(16000);await s.timers();assert.equal(s.reloads(),1);
});

test('incoming invitations and transcript draining defer automatic refresh',async()=>{
 const s=await setup();let incomingBusy=true;s.window.SteadyHandsInboundVoice={isBusyForUpdate:()=>incomingBusy};
 s.advance(20000);s.setTag('v2');await s.poll();assert.equal(s.reloads(),0);
 incomingBusy=false;await s.event('steadyhands:inbound-transcript',{detail:{ended:true}});await s.timers();assert.equal(s.reloads(),0);
 s.advance(36000);await s.timers();assert.equal(s.reloads(),1);
});
