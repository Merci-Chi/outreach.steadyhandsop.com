import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const approved=await readFile(new URL('../approved-caller.js',import.meta.url),'utf8');
const phoneSource=(await readFile(new URL('../twilio-voice.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function assignmentRig(){
 const state={session:{user:{id:'own'},expires_at:Date.now()/1000+3600},assigned:true,number:{id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'},refreshes:0,reads:0,numberReads:0,call:1,emptyEveryFifth:false,injected:false,authErrors:[],queryErrors:[]};
 const filters=[];
 const client={auth:{getSession:async()=>({data:{session:state.session}}),getUser:async()=>{const error=state.authErrors.shift();return error?{error}:{data:{user:state.session?.user}}},refreshSession:async()=>{state.refreshes++;if(state.refreshError)return {error:{message:'offline'}};state.session={...state.session,expires_at:Date.now()/1000+3600};return {data:{session:state.session}}}},from(table){const query={select(){return query},eq(k,v){filters.push([table,k,v]);return query},async maybeSingle(){
  if(table==='callcenter_phone_assignments'){
   state.reads++;const error=state.queryErrors.shift();if(error)return {error};
   if(state.emptyEveryFifth&&state.call%5===0&&!state.injected){state.injected=true;return {data:null}}
   return {data:state.assigned?{phone_number_id:'number'}:null};
  }
  state.numberReads++;if(state.changeAccountOnNumber)state.session={...state.session,user:{id:'other'}};
  return {data:state.number};
 }};return query;}};
 const window={steadyHandsCRMClient:client};vm.runInNewContext(approved,{window,setTimeout:fn=>fn(),Date});
 return {state,filters,client,check:()=>window.SteadyHandsApprovedCaller()};
}
test('20 consecutive checks recover an empty fifth lookup without losing the assigned caller',async()=>{
 const p=assignmentRig();p.state.emptyEveryFifth=true;
 for(let call=1;call<=20;call++){p.state.call=call;p.state.injected=false;assert.equal((await p.check()).phone_number,'+17025550101')}
 assert.equal(p.state.reads,24);assert.equal(p.state.refreshes,4);
 assert(p.filters.filter(([table,k])=>table==='callcenter_phone_assignments'&&k==='user_id').every(([, ,v])=>v==='own'));
});
test('expiring sessions and expired-JWT responses refresh once before a fresh lookup',async()=>{
 for(const mode of ['expiring','jwt']){
  const p=assignmentRig();if(mode==='expiring')p.state.session.expires_at=Date.now()/1000+10;else p.state.authErrors.push({status:401});
  assert(await p.check());assert.equal(p.state.refreshes,1);
 }
});
test('transient lookup errors retry once; persistent errors never become missing approval',async()=>{
 const p=assignmentRig();p.state.queryErrors.push({status:503,message:'unavailable'});assert(await p.check());assert.equal(p.state.reads,2);
 p.state.queryErrors.push({status:503},{status:503});await assert.rejects(p.check(),/Unable to check your phone assignment/);assert.equal(p.state.reads,4);
});
test('a real absent assignment is confirmed twice; disabled and pending numbers stay blocked',async()=>{
 const p=assignmentRig();p.state.assigned=false;assert.equal(await p.check(),null);assert.equal(p.state.reads,2);assert.equal(p.state.refreshes,1);
 for(const [property,value,pattern] of [['active',false,/disabled/],['twilio_status','pending',/Twilio Ready/]]){
  const q=assignmentRig();q.state.number[property]=value;await assert.rejects(q.check(),pattern);assert.equal(q.state.refreshes,0);assert.equal(q.state.reads,1);
 }
});
test('concurrent checks share a request but subsequent calls never reuse a cached approval',async()=>{
 const p=assignmentRig();const results=await Promise.all(Array.from({length:8},()=>p.check()));assert(results.every(Boolean));assert.equal(p.state.reads,1);
 p.state.number.active=false;await assert.rejects(p.check(),/disabled/);assert.equal(p.state.reads,2);
});
test('permission errors, signed-out sessions, refresh failures, and account changes fail closed',async()=>{
 const denied=assignmentRig();denied.state.queryErrors.push({status:403,message:'denied'});await assert.rejects(denied.check(),/Unable to check/);assert.equal(denied.state.refreshes,0);
 const out=assignmentRig();out.state.session=null;await assert.rejects(out.check(),/session has ended/);assert.equal(out.state.reads,0);
 const failed=assignmentRig();failed.state.assigned=false;failed.state.refreshError=true;await assert.rejects(failed.check(),/Unable to refresh/);assert.equal(failed.state.reads,1);
 const changed=assignmentRig();changed.state.changeAccountOnNumber=true;await assert.rejects(changed.check(),/account changed/);
});
function phoneRig(){
 let now=Date.now();class Clock extends Date{static now(){return now}}
 const state={user:'own',tokens:0,refreshes:0,microphones:0,connects:0,devices:[],errors:[]};
 class Device{
  constructor(token){this.token=token;this.handlers={};this.updates=[];state.devices.push(this)}
  on(k,fn){this.handlers[k]=fn}
  updateToken(token){this.token=token;this.updates.push(token)}
  destroy(){this.destroyed=true}
  async connect({params}){state.connects++;this.params=params;const handlers={};return {parameters:{CallSid:'CA'+state.connects},on(k,fn){handlers[k]=fn},disconnect(){handlers.disconnect?.()}}}
 }
 const client={auth:{getSession:async()=>({data:{session:{user:{id:state.user}}}}),refreshSession:async()=>{state.refreshes++;return {data:{session:{user:{id:state.user}}}}}},functions:{invoke:async()=>{state.tokens++;const status=state.errors.shift();if(status)return {error:{context:new Response(JSON.stringify({error:status===403?'Calling is disabled.':'Session expired.'}),{status})}};return {data:{token:'token-'+state.tokens,expires_in:120}}}}};
 const window={steadyHandsCRMClient:client,isSecureContext:true,dispatchEvent(){},SteadyHandsLeadDisposition:{ensureCallable:async()=>{}}};
 vm.runInNewContext(phoneSource,{window,Device,Date:Clock,console:{warn(){},error(){}},CustomEvent:class{},navigator:{mediaDevices:{getUserMedia:async()=>{state.microphones++;return {getTracks:()=>[]}}}}});
 return {state,voice:window.SteadyHandsTwilioVoice,advance:ms=>now+=ms,call:()=>window.SteadyHandsTwilioVoice.start('+17025550101',{crmId:'lead'})};
}
test('15 consecutive calls refresh expiring tokens before dialing without recreating the device',async()=>{
 const p=phoneRig();for(let i=0;i<15;i++){await p.call();p.voice.hangup();p.advance(70000)}
 assert.equal(p.state.connects,15);assert.equal(p.state.tokens,15);assert.equal(p.state.devices.length,1);assert.equal(p.state.devices[0].updates.length,14);
});
test('a token 401 refreshes once and retries authorization, never the dial itself',async()=>{
 const p=phoneRig();p.state.errors=[401];await p.call();assert.equal(p.state.refreshes,1);assert.equal(p.state.tokens,2);assert.equal(p.state.connects,1);
 const denied=phoneRig();denied.state.errors=[403];await assert.rejects(denied.call(),/Calling is disabled/);assert.equal(denied.state.refreshes,0);assert.equal(denied.state.connects,0);assert.equal(denied.state.microphones,0);
 const stillExpired=phoneRig();stillExpired.state.errors=[401,401];await assert.rejects(stillExpired.call(),/Session expired/);assert.equal(stillExpired.state.refreshes,1);assert.equal(stillExpired.state.connects,0);
});
test('failed background refresh is retried before the next call, and an expired token never dials',async()=>{
 const p=phoneRig();await p.call();p.voice.hangup();p.advance(70000);p.state.errors=[500];p.state.devices[0].handlers.tokenWillExpire();await tick();await tick();
 p.state.errors=[500];await assert.rejects(p.call(),/Session expired/);assert.equal(p.state.connects,1);
 await p.call();assert.equal(p.state.connects,2);assert.equal(p.state.devices[0].updates.length,1);
});
test('switching accounts discards the old device and obtains a token for the new account',async()=>{
 const p=phoneRig();await p.call();p.voice.hangup();p.state.user='other';await p.call();
 assert.equal(p.state.devices.length,2);assert.equal(p.state.devices[0].destroyed,true);assert.equal(p.state.tokens,2);assert.equal(p.state.devices[1].params.agent_user_id,'other');
});
test('an error followed by one empty read is not misreported as confirmed missing approval',async()=>{
 const p=assignmentRig();p.state.assigned=false;p.state.queryErrors.push({status:503});
 await assert.rejects(p.check(),/Unable to confirm your phone assignment/);assert.equal(p.state.reads,2);
});
