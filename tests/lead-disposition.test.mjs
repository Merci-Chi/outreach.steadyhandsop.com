import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../lead-disposition.js',import.meta.url),'utf8');
function setup(overrides={},writeResult={data:{id:'lead'}}) {
 const row={id:'lead',stage:'notstarted',tags:['Existing'],notes:'Original notes',assigned_user_id:'agent',phone:'(702) 555-0100',...overrides};
 const writes=[],filters=[],events=[],checks=[];
 const window={dispatchEvent:e=>events.push(e),steadyHandsCRMClient:{rpc:async(name,args)=>{checks.push({name,args});return overrides.rpcResult || {data:false};},auth:{getUser:async()=>({data:{user:{id:'agent',email:'agent@example.com'}}})},from(table){
  if(table==='callcenter_call_activity'){const history={select:()=>history,eq:()=>history,limit:async()=>({data:overrides.history||[],error:overrides.historyError||null})};return history;}
  let writing=false;const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},
   update(patch){writing=true;writes.push(patch);return q},single:async()=>writing?writeResult:{data:row}};return q;
 }}};
 vm.runInNewContext(source,{window,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}});
 return {api:window.SteadyHandsLeadDisposition,writes,filters,events,checks};
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
 for(const record of [{do_not_call:true},{stage:'donotcall'},{outcome:'Do Not Call'},{tags:['DNC']}])await assert.rejects(setup(record).api.ensureCallable('lead'),/DO NOT CALL/);
});
test('failed database write does not emit success',async()=>{const s=setup({}, {error:{message:'Write denied'}});await assert.rejects(s.api.save('lead','dnc'),/Write denied/);assert.equal(s.events.length,0)});
test('all action buttons occur before transcript in document order',async()=>{
 const html=await readFile(new URL('../call.html',import.meta.url),'utf8');const transcript=html.indexOf('aria-label="Live transcript"');
 for(const id of ['refStartSale','refDoNotCall','refSendTo','shOpenScripts'])assert(html.indexOf('id="'+id+'"')<transcript);
 assert(html.indexOf('aria-label="Call tools"')<transcript);
});

test('call guard checks the actual destination against the private suppression list',async()=>{
 const s=setup({rpcResult:{data:true}});
 await assert.rejects(s.api.ensureCallable('lead','+17025550199'),/DO NOT CALL/);
 assert.equal(s.checks[0].name,'outreach_call_is_blocked');
 assert.deepEqual({...s.checks[0].args},{p_phone:'+17025550199',p_crm_id:'lead'});
});
test('call guard fails closed on a missing, failed, or malformed DNC lookup',async()=>{
 for(const rpcResult of [{error:{message:'missing function'}},{data:null},{data:'false'}]) {
  await assert.rejects(setup({rpcResult}).api.ensureCallable('lead'),/Unable to verify/);
 }
});
test('allowed lead uses its saved number if no destination override was passed',async()=>{
 const s=setup();assert.equal(await s.api.ensureCallable('lead'),true);
 assert.equal(s.checks[0].args.p_phone,'(702) 555-0100');
});

test('previously called non-retryable leads cannot be called',async()=>{
 const s=setup({lastcalled:'2026-10-20T10:00:00Z'});
 await assert.rejects(s.api.ensureCallable('lead'),/Previously called lead/);
});
test('voicemail leads may be called after DNC validation',async()=>{
 const s=setup({lastcalled:'2026-10-20T10:00:00Z',outcome:'Left Voicemail'});
 assert.equal(await s.api.ensureCallable('lead'),true);
});

test('terminal tags block calls even without lastcalled and override retry tags',async()=>{
 for(const row of [{tags:['Wrong Number']},{outcome:'Wrong Number'},{tags:['Not Interested']},{tags:['No Answer','Wrong Number']},{tags:['Left Voicemail','Not Interested']}]){
  const s=setup({stage:'notstarted',...row});
  await assert.rejects(s.api.ensureCallable('lead'),/Calling blocked/);
  assert.equal(s.api.callBlocked(row),true);
 }
});
test('contact labels detect call tags with an empty outcome and timestamp',()=>{
 const s=setup();
 assert.equal(s.api.displayStage({stage:'notstarted',tags:['Left Voicemail']}),'Outreach');
 assert.equal(s.api.displayStage({stage:'notstarted',tags:['Wrong Number']}),'Wrong / invalid number');
 assert.equal(s.api.hasContact({tags:['No Answer']}),true);
 assert.equal(s.api.callBlocked({stage:'notstarted',tags:['No Answer']}),false);
});

test('call status is binary and shown separately from business tags',()=>{
 const s=setup();
 assert.equal(s.api.callStatus({call_status:'Called',tags:[]}), 'Called');
 assert.equal(s.api.callStatus({call_status:'Not called',stage:'outreach'}), 'Not called');
 assert.equal(s.api.callStatus({tags:[]}), 'Not called');
 assert.deepEqual(Array.from(s.api.businessTags({tags:['Called','Not started','Not called','Wrong Number']})), ['Wrong Number']);
});
