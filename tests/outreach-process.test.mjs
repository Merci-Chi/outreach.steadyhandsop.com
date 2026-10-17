import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../outreach-process.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function setup() {
  const element = () => ({value:'',textContent:'',disabled:false,checked:false,events:{},classList:{toggle(){}},addEventListener(type,fn){this.events[type]=fn;},closest(){return this;},focus(){}});
  const checks = Array.from({length:6},element), fields = {};
  for (const id of ['processFeedback','processPhone','processNotes','processProgress','processSend','processDevelopment','processStatus','processSteps','processLead']) fields['#'+id]=element();
  const panel={querySelector:s=>fields[s],querySelectorAll:()=>checks};
  const card={dataset:{crmId:'one'}}, storage=new Map(),writes=[];
  let observer;
  const document={querySelector:s=>s==='.outreach-process'?panel:s==='#selectedLeadTop .lead-card'?card:s==='#refCompany'?{textContent:'Business'}:{}};
  const row={tags:[],stage:'outreach',assigned_user_id:'agent'};
  const window={addEventListener(){},steadyHandsCRMClient:{auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(){return {select(){return this;},eq(){return this;},single:async()=>({data:row})};}},SteadyHandsLeadDisposition:{save:async(...args)=>writes.push(args)}};
  vm.runInNewContext(source,{document,window,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},MutationObserver:class{constructor(fn){observer=fn;}observe(){}}});
  await tick();
  const check=async i=>{checks[i-1].checked=true;await checks[i-1].events.change();};
  const fill=async(id,value)=>{fields['#'+id].value=value;await fields['#'+id].events.input();};
  return {checks,fields,row,writes,storage,check,fill,switchLead:async id=>{card.dataset.crmId=id;await observer();}};
}
test('handoff requires every call step, captures phone and notes, and checks step five after success',async()=>{
 const s=await setup();await s.fill('processPhone','2135550100');await s.fill('processNotes','Booking page');await s.check(4);
 await s.fields['#processSend'].events.click();assert.equal(s.writes.length,0);
 for(const i of [1,2,3])await s.check(i);
 await s.fields['#processSend'].events.click();assert.equal(s.writes.length,1);assert.match(s.writes[0][2],/2135550100.*Booking page/);assert(s.checks[4].checked);assert(s.fields['#processSend'].disabled);
});
test('invalid number cannot complete collection; progress is scoped to account and lead',async()=>{
 const s=await setup();await s.fill('processPhone','123');await s.check(3);assert.equal(s.checks[2].checked,false);
 await s.fill('processPhone','2135550100');await s.check(1);await s.switchLead('two');assert.equal(s.fields['#processPhone'].value,'');assert.equal(s.checks[0].checked,false);
 await s.switchLead('one');assert.equal(s.fields['#processPhone'].value,'2135550100');assert(s.checks[0].checked);assert([...s.storage.keys()].every(k=>k.includes(':agent:')));
});
test('status button reads the actual CRM stage and outcome',async()=>{
 const s=await setup();s.row.tags=['Development Team'];s.row.stage='review';s.row.outcome='Design in progress';await s.fields['#processStatus'].events.click();
 assert.equal(s.fields['#processDevelopment'].textContent,'CRM status: review · Design in progress');assert(s.checks[4].checked);
});
