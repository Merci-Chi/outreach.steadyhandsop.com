import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../lead-disposition.js',import.meta.url),'utf8');
function setup(overrides={},writeResult={data:{id:'lead'}}) {
 const row={id:'lead',stage:'outreach',tags:['Existing'],notes:'Original notes',assigned_user_id:'agent',...overrides};
 const writes=[],filters=[],events=[];
 const window={dispatchEvent:e=>events.push(e),steadyHandsCRMClient:{auth:{getUser:async()=>({data:{user:{id:'agent',email:'agent@example.com'}}})},from(table){
  let writing=false;const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},
   update(patch){writing=true;writes.push(patch);return q},single:async()=>writing?writeResult:{data:row}};return q;
 }}};
 vm.runInNewContext(source,{window,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}});
 return {api:window.SteadyHandsLeadDisposition,writes,filters,events};
}
test('DNC saves a durable stage, tag and audit note without discarding prior notes or tags',async()=>{
 const s=setup();await s.api.save('lead','dnc','Prospect requested no calls');
 const p=s.writes[0];assert.equal(p.stage,'donotcall');assert.equal(p.outcome,'Do Not Call');
 assert.deepEqual([...p.tags],['Existing','Do Not Call']);assert.match(p.notes,/Original notes\n.*DO NOT CALL confirmed.*Prospect requested no calls/);
 assert.equal(p.callbackdate,null);assert.equal(p.callbackat,null);
 assert(s.filters.some(([key,value])=>key==='assigned_user_id'&&value==='agent'));
});
test('warm handoff sends to review with development tags and required notes',async()=>{
 const s=setup();await s.api.save('lead','development','Needs a booking page');
 assert.equal(s.writes[0].stage,'review');assert(s.writes[0].tags.includes('Warm Lead'));assert(s.writes[0].tags.includes('Development Team'));
 assert.match(s.writes[0].notes,/Sent to Development Team.*Needs a booking page/);
});
test('warm handoff rejects empty notes',async()=>{const s=setup();await assert.rejects(s.api.save('lead','development',' '),/handoff note/);assert.equal(s.writes.length,0)});
test('DNC cannot be overwritten by warm handoff',async()=>{const s=setup({stage:'donotcall'});await assert.rejects(s.api.save('lead','development','Interested'),/Do Not Call/);assert.equal(s.writes.length,0)});
test('another agent cannot change the lead',async()=>{const s=setup({assigned_user_id:'other'});await assert.rejects(s.api.save('lead','dnc'),/not assigned/);assert.equal(s.writes.length,0)});
test('call guard honors DNC in stages, outcomes or tags',async()=>{
 for(const record of [{stage:'donotcall'},{outcome:'Do Not Call'},{tags:['DNC']}])await assert.rejects(setup(record).api.ensureCallable('lead'),/DO NOT CALL/);
});
test('failed database write does not emit success',async()=>{const s=setup({}, {error:{message:'Write denied'}});await assert.rejects(s.api.save('lead','dnc'),/Write denied/);assert.equal(s.events.length,0)});
test('all action buttons occur before transcript in document order',async()=>{
 const html=await readFile(new URL('../call.html',import.meta.url),'utf8');const transcript=html.indexOf('aria-label="Live transcript"');
 for(const id of ['refStartSale','refDoNotCall','refSendTo','shOpenScripts'])assert(html.indexOf('id="'+id+'"')<transcript);
 assert(html.indexOf('aria-label="Call tools"')<transcript);
});
