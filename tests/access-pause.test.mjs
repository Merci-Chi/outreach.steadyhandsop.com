import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
async function guard(page,status){
 const events={},docEvents={},redirects=[];let interval,notify,reads=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'u',created_at:'2020-01-01'}}}})},
  rpc:async()=>{reads++;if(status.error)return {error:{message:'offline'}};return {data:status};},
  channel:()=>({on(_type,_filter,callback){notify=callback;return this;},subscribe(){}})};
 const window={supabase:{createClient:()=>client},addEventListener(k,fn){events[k]=fn;},setInterval(fn){interval=fn;}};
 const document={head:{appendChild(){}},createElement:()=>({}),documentElement:{classList:{add(){},remove(){}}},addEventListener(k,fn){docEvents[k]=fn;},visibilityState:'visible'};
 const storage={getItem:()=> '1',setItem(){}};
 vm.runInNewContext(read('auth-guard.js'),{window,document,location:{pathname:'/'+page,search:'',hash:'',replace:v=>redirects.push(v)},sessionStorage:storage,localStorage:storage,URLSearchParams,console:{error(){}}});
 await docEvents.DOMContentLoaded();
 return {window,redirects,events,interval,notify,reads:()=>reads};
}
test('pending actions block all workspace routes even when the legacy pause is clear',async()=>{
 for(const page of ['index.html','leads.html','call.html','queue.html','admin.html']){
  const h=await guard(page,{is_paused:true,action_required:true,agreement_action_required:false});
  assert.deepEqual(h.redirects,['action-needed.html?open=1']);
 }
 const agreement=await guard('index.html',{is_paused:true,action_required:false});assert.deepEqual(agreement.redirects,['pause.html']);
});
test('action pages remain available and final completion immediately restores access',async()=>{
 const status={is_paused:true,action_required:true};
 const h=await guard('action-needed.html',status);assert.deepEqual(h.redirects,[]);
 await h.window.outreachRecheckAccess();assert.deepEqual(h.redirects,[]);
 status.action_required=false; // An agreement still blocks access.
 await h.window.outreachRecheckAccess();assert.deepEqual(h.redirects,[]);
 status.is_paused=false;await h.window.outreachRecheckAccess();assert.deepEqual(h.redirects,['index.html']);
});
test('open workspaces recheck broadcasts, focus and polling; failures close access',async()=>{
 const status={is_paused:false,action_required:false};const h=await guard('index.html',status);
 status.is_paused=true;status.action_required=true;await h.notify();assert.equal(h.redirects.at(-1),'action-needed.html?open=1');
 status.error=true;await h.events.focus();assert.equal(h.redirects.at(-1),'pause.html');
 assert.equal(typeof h.interval,'function');
});
test('unverified initial access never opens the workspace',async()=>{
 const h=await guard('index.html',{});assert.deepEqual(h.redirects,['pause.html']);
});
