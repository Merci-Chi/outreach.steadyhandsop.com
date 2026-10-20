import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const workflow=await readFile(new URL('../outreach-workflow.js',import.meta.url),'utf8');
const review=workflow.slice(workflow.indexOf('  let reviewPending=null;'),workflow.indexOf('  // All transcript state'));
const controller=await readFile(new URL('../call-voice-controller.js',import.meta.url),'utf8');
const reference=await readFile(new URL('../outreach-reference.js',import.meta.url),'utf8');
const handoff=reference.slice(reference.indexOf('let checkingCaller'),reference.indexOf('function openOutreachSetupPopup'));
const tick=()=>new Promise(r=>setImmediate(r));
function reviewPage(){
 let dialog,dialogCount=0;const events={},calls=[];let selected='lead';
 class Node{
  constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.events={};this.isConnected=true;}
  append(...nodes){this.children.push(...nodes)}
  setAttribute(){} focus(){} showModal(){this.open=true}
  remove(){this.isConnected=false}
  addEventListener(type,fn){this.events[type]=fn}
  close(){this.open=false;this.events.close?.()}
 }
 const nodes={refMessage:new Node('p'),refEndCall:new Node('button')};
 const window={addEventListener:(k,fn)=>events[k]=fn,dispatchEvent(){},
  steadyHandsCallLead:{id:'lead',number:'+17025550102',company:'Business'},
  SteadyHandsApprovedCaller:async()=>({phone_number:'+17025550101'}),
  steadyHandsCRMClient:{rpc:async()=>({data:{mode:'normal',delay_seconds:0},error:null})},
  SteadyHandsTwilioVoice:{isActive:()=>false,start:async(...args)=>calls.push(args)}};
 const context=vm.createContext({window,document:{body:{append(node){dialog=node;dialogCount++}},getElementById:id=>nodes[id]},
  make:(tag,text)=>new Node(tag,text),leadId:()=>selected,core:{load:async()=>({row:{company:'Business',phone:'+17025550102'}})},URL,
  CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}});
 vm.runInContext(review,context);vm.runInContext(controller,context);
 const all=node=>[node,...node.children.flatMap(all)];
 return {window,calls,nodes,dialogCount:()=>dialogCount,start:()=>events['steadyhands:start-call-request'](),
  changeLead(){selected='other';window.steadyHandsCallLead.id='other'},
  async confirm(){await tick();const ack=all(dialog).find(n=>n.id==='precallAcknowledged');ack.checked=true;ack.onchange();all(dialog).find(n=>n.textContent==='Continue to call').onclick()},
  cancel(){all(dialog).find(n=>n.textContent==='Back').onclick()}};
}
test('confirming the real review continues directly to one dial attempt',async()=>{
 const s=reviewPage();const pending=s.start();await tick();assert.equal(s.calls.length,0);
 await s.confirm();await pending;assert.equal(s.calls.length,1);assert.equal(s.calls[0][1].crmId,'lead');
});
test('cancel and changing prospects during review never dial',async()=>{
 for(const change of [false,true]){
  const s=reviewPage();const pending=s.start();await tick();
  if(change){s.changeLead();await s.confirm();assert.equal(s.calls.length,0)}
  s.cancel();await pending;assert.equal(s.calls.length,0);
 }
});
function outreachPage(reviewResult=true){
 const calls=[],routes=[];const window={location:{assign:url=>routes.push(url)},
  SteadyHandsReviewBeforeCall:async()=>{calls.push('review');return reviewResult},
  SteadyHandsLeadDisposition:{ensureCallable:async()=>calls.push('disposition')},
  SteadyHandsApprovedCaller:async()=>({phone_number:'+17025550101'})};
 const context=vm.createContext({window,document:{},currentLead:()=>({id:'lead',number:'+17025550102',company:'Business'}),
  tell(){},sessionStorage:{setItem(){}},URLSearchParams,$:()=>null,
  openRegularPhonePopup:()=>calls.push('regular-dialer'),openOutreachSetupPopup(){}});
 vm.runInContext(handoff,context);return {window,calls,routes,open:mode=>vm.runInContext(`linkCall('${mode}')`,context)};
}
test('app handoff opens the call screen without a duplicate review',async()=>{
 const s=outreachPage();await s.open('app');assert.equal(s.routes.length,1);
 assert.match(s.routes[0],/^call.html\?/);assert.deepEqual(s.calls,[]);
});
test('regular phone calls retain review before showing the dialer',async()=>{
 const s=outreachPage();await s.open('regular');assert.deepEqual(s.calls,['review','disposition','regular-dialer']);
 const canceled=outreachPage(false);await canceled.open('regular');assert.deepEqual(canceled.calls,['review']);
});

test('opening the app dialer never waits on slow preflight requests', {timeout:1000}, async()=>{
 const calls=[],routes=[];const waiting=new Promise(()=>{});
 const window={location:{assign:url=>routes.push(url)},SteadyHandsLeadDisposition:{ensureCallable:()=>{calls.push('dnc');return waiting}},SteadyHandsApprovedCaller:()=>{calls.push('caller');return waiting}};
 const context=vm.createContext({window,currentLead:()=>({id:'chosen',number:'+17025550102',company:'Chosen business'}),tell(){},sessionStorage:{setItem(){}},URLSearchParams,$:()=>null});
 vm.runInContext(handoff,context);await vm.runInContext("linkCall('app')",context);
 assert.equal(routes.length,1);assert.match(routes[0],/crm_id=chosen/);assert.deepEqual(calls,[]);
});

test('rapid call clicks wait for one conversation guide before opening one pre-call review',async()=>{
 const s=reviewPage();let resolveGuide,guideCalls=0;
 s.window.SteadyHandsCallGuide={prepare:id=>{assert.equal(id,'lead');guideCalls++;return new Promise(resolve=>resolveGuide=resolve)}};
 const first=s.start();await tick();const repeated=s.start();await repeated;
 assert.equal(guideCalls,1);assert.equal(s.dialogCount(),0);assert.equal(s.calls.length,0);
 resolveGuide(true);await tick();assert.equal(s.dialogCount(),1);assert.equal(s.calls.length,0);
 await s.confirm();await first;assert.equal(s.calls.length,1);assert.equal(guideCalls,1);
});
test('a canceled guide preparation never opens the review or dials',async()=>{
 const s=reviewPage();s.window.SteadyHandsCallGuide={prepare:async()=>false};
 await s.start();assert.equal(s.dialogCount(),0);assert.equal(s.calls.length,0);assert.equal(s.nodes.refMessage.textContent,'Call canceled.');assert.equal(s.nodes.refEndCall.disabled,false);
});
test('rapid regular-phone clicks share one review and open the guided dialer once',async()=>{
 const s=outreachPage();let resolveReview,reviews=0;
 s.window.SteadyHandsReviewBeforeCall=()=>{reviews++;return new Promise(resolve=>resolveReview=resolve)};
 const first=s.open('regular');const repeated=s.open('regular');await repeated;
 assert.equal(reviews,1);assert.equal(s.calls.length,0);
 resolveReview(true);await first;assert.deepEqual(s.calls,['disposition','regular-dialer']);
});
