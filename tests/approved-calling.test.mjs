import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const helper=await readFile(new URL('../approved-caller.js',import.meta.url),'utf8');
const controller=await readFile(new URL('../call-voice-controller.js',import.meta.url),'utf8');
function checker({assignment={phone_number_id:'number'},number={id:'number',phone_number:'+17025550101',active:true,twilio_status:'ready'},error=null}={}) {
 const queries=[];
 const window={steadyHandsCRMClient:{auth:{getSession:async()=>({data:{session:{user:{id:'signed-in-user'}}}}),refreshSession:async()=>({data:{session:{user:{id:'signed-in-user'}}}}),getUser:async()=>({data:{user:{id:'signed-in-user'}}})},from(table){
  const query={select(){return query},eq(column,value){queries.push([table,column,value]);return query},maybeSingle:async()=>({data:table==='callcenter_phone_assignments'?assignment:number,error})};return query;
 }}};
 vm.runInNewContext(helper,{window,setTimeout:fn=>fn()});
 return {window,queries};
}
test('approved assignment works without personal SMS verification and scopes lookup to signed-in user',async()=>{
 const {window,queries}=checker();
 assert.equal((await window.SteadyHandsApprovedCaller()).phone_number,'+17025550101');
 assert.deepEqual(queries,[['callcenter_phone_assignments','user_id','signed-in-user'],['callcenter_phone_numbers','id','number']]);
});
for(const [name,options] of [
 ['unassigned',{assignment:null}],['disabled',{number:{phone_number:'+17025550101',active:false,twilio_status:'ready'}}],
 ['pending',{number:{phone_number:'+17025550101',active:true,twilio_status:'pending'}}],['missing number',{number:null}]
])test(name+' cannot call',async()=>{const check=checker(options).window.SteadyHandsApprovedCaller();if(name==='unassigned')assert.equal(await check,null);else await assert.rejects(check,/disabled|Twilio Ready|could not be loaded/);});
test('database error fails closed',async()=>assert.rejects(checker({error:{message:'denied'}}).window.SteadyHandsApprovedCaller(),/Unable to check/));
test('approval is fetched again after admin changes',async()=>{
 const number={phone_number:'+17025550101',active:true,twilio_status:'pending'};
 const {window}=checker({number});
 await assert.rejects(window.SteadyHandsApprovedCaller(),/Twilio Ready/);
 number.twilio_status='ready';assert(await window.SteadyHandsApprovedCaller());
 number.active=false;await assert.rejects(window.SteadyHandsApprovedCaller(),/disabled/);
});
function callPage(approved) {
 const handlers={},events=[],calls=[];
 const nodes={refMessage:{textContent:''},refEndCall:{disabled:false}};
 const window={addEventListener(name,fn){handlers[name]=fn},dispatchEvent(event){events.push(event)},
  steadyHandsCallLead:{id:'lead',number:'+17025550102',company:'Prospect'},
  SteadyHandsApprovedCaller:async()=>approved,
  steadyHandsCRMClient:{rpc:async()=>({data:{mode:'normal',delay_seconds:0},error:null})},
  SteadyHandsReviewBeforeCall:async()=>true,
  SteadyHandsTwilioVoice:{isActive:()=>false,start:async(...args)=>{
   calls.push(args);
   handlers['steadyhands:voice-state']({detail:{state:'calling',attemptId:'test-call'}});
   handlers['steadyhands:voice-state']({detail:{state:'dialed',attemptId:'test-call'}});
   return {parameters:{}};
  },hangup(){calls.push('hangup')}}};
 vm.runInNewContext(controller,{window,document:{getElementById:id=>nodes[id]},CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}});
 return {handlers,events,calls,nodes,window};
}
test('call button starts Twilio for approved assigned number without sending a spoofable From',async()=>{
 const page=callPage({phone_number:'+17025550101'});
 await page.handlers['steadyhands:start-call-request']();
 assert.equal(page.calls.length,1);assert.equal(page.calls[0][0],'+17025550102');
 assert.equal(page.calls[0][1].transcribe,true);assert.equal(page.calls[0][1].crmId,'lead');assert(!('From' in page.calls[0][1]));
 assert.equal(page.events.at(-1).detail.active,true);
});
test('direct call page cannot start Twilio without approval',async()=>{
 const page=callPage(null);await page.handlers['steadyhands:start-call-request']();
 assert.equal(page.calls.length,0);assert.match(page.nodes.refMessage.textContent,/No approved calling number/);
});

test('canceling pre-call review prevents the dialer from starting',async()=>{
 const page=callPage({phone_number:'+17025550101'});page.window.SteadyHandsReviewBeforeCall=async()=>false;
 await page.handlers['steadyhands:start-call-request']();assert.equal(page.calls.length,0);assert.equal(page.nodes.refEndCall.disabled,false);
});
test('missing review module fails closed with a useful message',async()=>{
 const page=callPage({phone_number:'+17025550101'});delete page.window.SteadyHandsReviewBeforeCall;
 await page.handlers['steadyhands:start-call-request']();assert.equal(page.calls.length,0);assert.match(page.nodes.refMessage.textContent,/Prospect review is still loading/);
});

test('slow caller approval immediately shows progress and cannot dial before approval',async()=>{
 const page=callPage({phone_number:'+17025550101'});let resolve;
 page.window.SteadyHandsApprovedCaller=()=>new Promise(r=>resolve=r);
 const pending=page.handlers['steadyhands:start-call-request']();
 assert.match(page.nodes.refMessage.textContent,/Checking your approved calling number/);
 assert.equal(page.nodes.refEndCall.disabled,true);assert.equal(page.calls.length,0);
 resolve(null);await pending;assert.equal(page.nodes.refEndCall.disabled,false);
 assert.match(page.nodes.refMessage.textContent,/No approved calling number/);assert.equal(page.calls.length,0);
});
test('call progress is rendered beside calling controls on both workspaces',async()=>{
 for(const page of ['index.html','call.html']){
  const html=await readFile(new URL('../'+page,import.meta.url),'utf8');
  assert.equal((html.match(/id="refMessage"/g)||[]).length,1);
  assert(html.indexOf('id="refMessage"')<html.indexOf('id="workflowReview"'));
 }
});
