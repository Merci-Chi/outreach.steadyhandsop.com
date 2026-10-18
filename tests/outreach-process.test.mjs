import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../outreach-process.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({callLead=null,missingCard=false,server=new Map(),tags=[],legacy=false,missingTable=false,failWrite=false,delayedClient=false}={}) {
 const element=()=>({value:'',textContent:'',disabled:false,checked:false,events:{},classList:{toggle(){}},addEventListener(type,fn){this.events[type]=fn;},closest(){return this;},focus(){}});
 const checks=Array.from({length:6},element),fields={};
 for(const id of ['processFeedback','processPhone','processNotes','processProgress','processSend','processDevelopment','processStatus','processSteps','processLead'])fields['#'+id]=element();
 const panel={querySelector:s=>fields[s],querySelectorAll:()=>checks};
 const card={dataset:{crmId:'one'}},storage=new Map(),handoffs=[],changes=[],listeners={};let observer;
 if(legacy)storage.set('steadyhands-process-v1:agent:one',JSON.stringify({steps:Array(6).fill(true),sent:true,phone:'2135550100'}));
 const row={tags,stage:'outreach',assigned_user_id:'agent'};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'agent'}}}})},from(table){let id;const q={select(){return q;},eq(k,v){id=v;return q;},single:async()=>({data:row}),then(resolve,reject){return Promise.resolve(missingTable?{error:{message:'relation outreach_process_checks does not exist'}}:{data:[...server.values()].filter(value=>value.crm_id===id)}).then(resolve,reject);}};return q;},async rpc(name,args){
  changes.push({name,...args});if(failWrite)return {error:{message:'Save denied'}};
  const key=args.p_crm_id+':'+args.p_step_no,old=server.get(key),version=old?.version||0;
  if(version!==args.p_expected_version)return {error:{message:'Checklist changed in another window'}};
  const saved={crm_id:args.p_crm_id,step_no:args.p_step_no,is_checked:args.p_is_checked,version:version+1};server.set(key,saved);return {data:[saved]};
 }};
 const document={addEventListener(){},querySelector:s=>s==='.outreach-process'?panel:s==='#selectedLeadTop .lead-card'?(missingCard?null:card):s==='#refCompany'?{textContent:'Business'}:{}};
 const window={steadyHandsCallLead:callLead,addEventListener(type,fn){listeners[type]=fn;},steadyHandsCRMClient:delayedClient?null:client,SteadyHandsLeadDisposition:{save:async(...args)=>handoffs.push(args)}};
 const timers=new Map();let timerId=0;
 vm.runInNewContext(source,{document,window,console:{warn(){}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});await tick();
 const check=async(i,value=true)=>{checks[i-1].checked=value;await checks[i-1].events.change();};
 const fill=async(id,value)=>{fields['#'+id].value=value;await fields['#'+id].events.input();};
 return {timers,window,checks,fields,row,storage,server,handoffs,changes,check,fill,client,refresh:async()=>{await fields['#processStatus'].events.click();await tick();},switchLead:async id=>{card.dataset.crmId=id;observer();await tick();}};
}
test('legacy browser checks and development tags never check any step',async()=>{
 const s=await setup({legacy:true,tags:['Development Team']});assert(s.checks.every(input=>!input.checked));assert.equal(s.changes.length,0);assert.equal(s.fields['#processProgress'].textContent,'0 / 6');
});
test('manual check and uncheck are persisted through the CRM RPC with versions',async()=>{
 const s=await setup();await s.check(5);assert(s.checks[4].checked);assert.equal(s.changes[0].name,'set_outreach_process_check');assert.equal(s.changes[0].p_step_no,5);assert.equal(s.changes[0].p_expected_version,0);
 await s.check(5,false);assert.equal(s.changes[1].p_expected_version,1);assert.equal(s.checks[4].checked,false);assert.equal(s.server.get('one:5').is_checked,false);
});
test('development handoff does not check step five automatically',async()=>{
 const s=await setup();await s.fill('processPhone','2135550100');await s.fill('processNotes','Booking page');for(const i of [1,2,3,4])await s.check(i);
 await s.fields['#processSend'].events.click();assert.equal(s.handoffs.length,1);assert.match(s.handoffs[0][2],/2135550100.*Booking page/);assert.equal(s.checks[4].checked,false);assert.equal(s.changes.length,4);
});
test('editing a phone number does not silently change a saved checkbox',async()=>{
 const s=await setup();await s.fill('processPhone','2135550100');await s.check(3);await s.fill('processPhone','123');assert.equal(s.checks[2].checked,true);assert.equal(s.changes.length,1);
});
test('checklist survives another window and is isolated by CRM lead',async()=>{
 const server=new Map(),first=await setup({server});await first.check(1);const second=await setup({server});assert(second.checks[0].checked);
 await second.switchLead('two');assert(second.checks.every(input=>!input.checked));await second.check(6);await second.switchLead('one');assert(second.checks[0].checked);assert.equal(second.checks[5].checked,false);
});
test('status refresh reads CRM checks without inferring completion or writing',async()=>{
 const s=await setup();s.row.tags=['Development Team'];s.row.stage='review';s.row.outcome='Design in progress';await s.refresh();assert.equal(s.fields['#processDevelopment'].textContent,'CRM status: review · Design in progress');assert.equal(s.checks[4].checked,false);assert.equal(s.changes.length,0);
});
test('missing migration fails closed with no local checkbox fallback',async()=>{
 const s=await setup({missingTable:true,legacy:true});assert(s.fields['#processSteps'].disabled);assert(s.checks.every(input=>!input.checked));assert.equal(s.fields['#processFeedback'].textContent,'Loading…');assert.equal(s.timers.size,1);
});
test('failed writes are not shown as completed',async()=>{
 const s=await setup({failWrite:true});await s.check(1);assert.equal(s.checks[0].checked,false);assert.equal(s.server.size,0);assert.match(s.fields['#processFeedback'].textContent,/not saved/);
});
test('stale changes reload CRM values and require a new manual click',async()=>{
 const server=new Map(),a=await setup({server}),b=await setup({server});await a.check(1);await b.check(1);assert.match(b.fields['#processFeedback'].textContent,/another window/);assert(b.checks[0].checked);assert.equal(b.changes.length,1);
 await b.check(1,false);assert.equal(server.get('one:1').is_checked,false);
});
test('draft storage never contains checklist values; dialer works without a legacy card',async()=>{
 const s=await setup({callLead:{id:'call-lead'},missingCard:true});await s.fill('processPhone','2135550100');await s.check(1);
 const draft=JSON.parse(s.storage.get('steadyhands-process-draft-v2:agent:call-lead'));assert.deepEqual(draft,{phone:'2135550100',notes:''});assert.equal(s.server.get('call-lead:1').is_checked,true);
});

test('checklist waits for the CRM client and automatically loads without reselecting',async()=>{
 const server=new Map([['one:1',{crm_id:'one',step_no:1,is_checked:true,version:2}]]);
 const s=await setup({server,delayedClient:true});
 assert.equal(s.fields['#processFeedback'].textContent,'Loading…');
 assert(s.fields['#processSteps'].disabled);assert(s.fields['#processSend'].disabled);
 s.window.steadyHandsCRMClient=s.client;
 const retry=[...s.timers.values()][0];await retry();await tick();
 assert.equal(s.fields['#processSteps'].disabled,false);assert(s.checks[0].checked);
 assert.equal(s.fields['#processFeedback'].textContent,'');assert.equal(s.changes.length,0);
});
test('a read failure recovers on retry and displays CRM values',async()=>{
 const s=await setup();const original=s.client.from;let failed=true;
 s.client.from=table=>{if(table==='outreach_process_checks'&&failed)return {select(){return this},eq(){return Promise.resolve({error:{message:'Temporary connection error'}})}};return original(table);};
 await s.refresh();assert.equal(s.fields['#processFeedback'].textContent,'Loading…');
 failed=false;s.server.set('one:2',{crm_id:'one',step_no:2,is_checked:true,version:1});
 await [...s.timers.values()][0]();await tick();
 assert(s.checks[1].checked);assert.equal(s.fields['#processSteps'].disabled,false);
});
