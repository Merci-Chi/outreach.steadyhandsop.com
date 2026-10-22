import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../auth-guard.js',import.meta.url),'utf8');
async function guard(page,status,{storage=new Map(),user='u'}={}){
 const events={},docEvents={},redirects=[];let interval,notify,reads=0,errorDialog=null,reloads=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:user,created_at:'2020-01-01'}}}})},rpc:async()=>{reads++;return status.error?{error:{message:'offline'}}:{data:status}},channel:()=>({on(_type,_filter,callback){notify=callback;return this},subscribe(){}})};
 const window={dispatchEvent(){},supabase:{createClient:()=>client},addEventListener:(k,fn)=>events[k]=fn,setInterval:fn=>interval=fn};
 const document={getElementById:()=>null,head:{appendChild(){}},body:{appendChild(node){errorDialog=node}},createElement:()=>({style:{},setAttribute(){},addEventListener(){},querySelector(){return {addEventListener:(_name,fn)=>this.retry=fn}},showModal(){this.open=true},close(){this.open=false},remove(){this.removed=true}}),documentElement:{classList:{add(){},remove(){}}},addEventListener:(k,fn)=>docEvents[k]=fn,visibilityState:'visible'};
 const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 storage.set('callcenter-resume-checked','1');
 const url=new URL(page,'https://outreach.steadyhandsop.com/');
 vm.runInNewContext(source,{window,document,URL,URLSearchParams,Date,location:{pathname:url.pathname,search:url.search,hash:url.hash,href:url.href,origin:url.origin,replace:v=>redirects.push(v),reload:()=>reloads++},sessionStorage:store,localStorage:store,CustomEvent:class {},console:{error(){}}});
 await docEvents.DOMContentLoaded();return {window,redirects,events,interval,notify,storage,reads:()=>reads,get errorDialog(){return errorDialog},reloads:()=>reloads};
}
const portal=value=>{const u=new URL(value);assert.equal(u.origin,'https://onboard.steadyhandsop.com');assert.equal(u.searchParams.get('from'),'outreach');return u;};
test('paused workspaces and a refreshed call page go directly to the onboarding portal',async()=>{
 for(const page of ['index.html','leads.html','call.html?crm_id=123&number=private','queue.html','admin.html']){
  const h=await guard(page,{is_paused:true,action_required:true});const target=portal(h.redirects[0]);
  assert(!target.href.includes('private'));assert(!target.href.includes('questionnaire'));
  if(page.startsWith('call'))assert.equal(target.searchParams.get('return_to'),'https://outreach.steadyhandsop.com/call.html?crm_id=123');
 }
 const h=await guard('index.html',{is_paused:true,action_required:false,agreement_action_required:true});portal(h.redirects[0]);
});
test('legacy questionnaire routes hand off without reading or opening a local questionnaire',async()=>{
 for(const page of ['action-needed.html','alreadyoncommission.html','currentlyonhourlywage.html']){
  const h=await guard(page,{is_paused:true,action_required:true});portal(h.redirects[0]);assert.equal(h.reads(),0);
 }
});
test('completion restores the full saved call workspace and removes its one-time return state',async()=>{
 const paused=await guard('call.html?crm_id=123&number=business',{is_paused:true});
 const resumed=await guard('call.html?crm_id=123',{is_paused:false},{storage:paused.storage});
 assert.equal(resumed.redirects[0],'call.html?crm_id=123&number=business');assert(!resumed.storage.has('outreach-onboarding-return'));
});
test('saved destinations from another account or an external site cannot be restored',async()=>{
 const state=new Map([['outreach-onboarding-return',JSON.stringify({userId:'other',href:'call.html',savedAt:Date.now()})]]);
 const h=await guard('index.html',{is_paused:false},{storage:state});assert.equal(h.redirects.length,0);
 state.set('outreach-onboarding-return',JSON.stringify({userId:'u',href:'https://evil.example/call.html',savedAt:Date.now()}));
 const evil=await guard('index.html',{is_paused:false},{storage:state});assert.equal(evil.redirects.length,0);
});
test('confirmed pauses redirect while failed verification stays on the current page',async()=>{
 const status={is_paused:false};const h=await guard('index.html',status);status.is_paused=true;await h.notify();portal(h.redirects.at(-1));
 const active={is_paused:false};const open=await guard('call.html?crm_id=123',active);
 active.error=true;await open.events.focus();assert.equal(open.redirects.length,0);assert.equal(open.errorDialog.open,true);assert.equal(typeof open.interval,'function');
 active.error=false;await open.events.online();assert.equal(open.errorDialog.removed,true);
 const invalid=await guard('call.html',{});assert.equal(invalid.redirects.length,0);assert.equal(invalid.errorDialog.open,true);
 const offline=await guard('index.html',{error:true});assert.equal(offline.redirects.length,0);assert.equal(offline.errorDialog.open,true);assert(!offline.storage.has('outreach-onboarding-return'));offline.errorDialog.retry();assert.equal(offline.reloads(),1);
});

test('calling blocks show a dedicated notice before onboarding and refresh after unblocking',async()=>{
 const status={is_paused:true,calling_blocked:true};
 const h=await guard('leads.html',status);
 assert.equal(h.redirects.length,0);assert.equal(h.errorDialog.id,'callingBlockedNotice');
 assert.match(h.errorDialog.innerHTML,/Outreach access paused/);
 status.is_paused=false;status.calling_blocked=false;await h.events.focus();
 assert.equal(h.reloads(),1);
});
