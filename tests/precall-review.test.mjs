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
 let dialog;const events={},calls=[];let selected='lead';
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
  SteadyHandsTwilioVoice:{isActive:()=>false,start:async(...args)=>calls.push(args)}};
 const context=vm.createContext({window,document:{body:{append(node){dialog=node}},getElementById:id=>nodes[id]},
  make:(tag,text)=>new Node(tag,text),leadId:()=>selected,core:{load:async()=>({row:{company:'Business',phone:'+17025550102'}})},URL,
  CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}});
 vm.runInContext(review,context);vm.runInContext(controller,context);
 const all=node=>[node,...node.children.flatMap(all)];
 return {window,calls,nodes,start:()=>events['steadyhands:start-call-request'](),
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
 vm.runInContext(handoff,context);return {calls,routes,open:mode=>vm.runInContext(`linkCall('${mode}')`,context)};
}
test('app handoff opens the call screen without a duplicate review',async()=>{
 const s=outreachPage();await s.open('app');assert.equal(s.routes.length,1);
 assert.match(s.routes[0],/^call.html\?/);assert.deepEqual(s.calls,['disposition']);
});
test('regular phone calls retain review before showing the dialer',async()=>{
 const s=outreachPage();await s.open('regular');assert.deepEqual(s.calls,['review','disposition','regular-dialer']);
 const canceled=outreachPage(false);await canceled.open('regular');assert.deepEqual(canceled.calls,['review']);
});
