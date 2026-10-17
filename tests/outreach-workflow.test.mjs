import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../outreach-workflow-core.js',import.meta.url),'utf8');
function setup({owner='agent',fail=false,tags=['Existing']}={}){
 const writes=[],filters=[];const row={id:'lead',assigned_user_id:owner,tags};
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(table){let writing=false;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},update(p){writes.push(p);writing=true;return q;},gte(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>({data:{id:'transcript',crm_id:'lead',segments:[]}}),single:async()=>writing?(fail?{error:{message:'denied'}}:{data:{id:'lead'}}):{data:row}};return q;}};
 const window={SteadyHandsLeadDisposition:{blocked:()=>false}};vm.runInNewContext(source,{window});return {api:window.SteadyHandsWorkflowCore,client,writes,filters};
}
test('interested and booking keywords suggest distinct tags, DNC takes precedence',()=>{
 const {api}=setup();assert.deepEqual([...api.suggestions('I’m interested in online booking').map(a=>a.id)],['tag:Interested','tag:Booking Needed']);
 assert.deepEqual([...api.suggestions('Sounds good, but stop calling me').map(a=>a.id)],['dnc']);
 assert(!api.suggestions('I am not interested').some(a=>a.id==='tag:Interested'));
 assert.equal(api.suggestions('I do not want you to call me').some(a=>a.id==='tag:Interested'),false);
});
test('follow-up and text requests suggest actions without writing anything',()=>{
 const {api,writes}=setup();assert(api.suggestions('Call me back tomorrow and text me').some(a=>a.id==='calendar'));
 assert(api.suggestions('Call me back tomorrow and text me').some(a=>a.id==='phone'));assert.equal(writes.length,0);
});
test('applying a suggested tag preserves existing tags and scopes the write to the signed-in owner',async()=>{
 const {api,client,writes,filters}=setup();await api.addTag(client,'lead','Interested');assert.deepEqual([...writes[0].tags],['Existing','Interested']);assert(filters.some(([k,v])=>k==='assigned_user_id'&&v==='agent'));
});
test('another account cannot read or update the lead through workflow helpers',async()=>{
 const {api,client,writes}=setup({owner:'other'});await assert.rejects(api.load(client,'lead'),/not assigned/);await assert.rejects(api.addTag(client,'lead','Interested'),/not assigned/);assert.equal(writes.length,0);
});
test('failed and duplicate tag writes are handled without false success',async()=>{
 const failed=setup({fail:true});await assert.rejects(failed.api.addTag(failed.client,'lead','Interested'),/denied/);
 const duplicate=setup({tags:['Interested']});await duplicate.api.addTag(duplicate.client,'lead','Interested');assert.equal(duplicate.writes.length,0);
});

test('saved transcript lookup is limited to the signed-in user, selected lead and current call start',async()=>{
 const s=setup();await s.api.fetchTranscript(s.client,'lead','2026-10-17T20:00:00Z');
 for(const pair of [['user_id','agent'],['crm_id','lead'],['started_at','2026-10-17T20:00:00Z']])assert(s.filters.some(([key,value])=>key===pair[0]&&value===pair[1]));
});
test('transcript segments remain ordered; unknown roles never become prospect speech',()=>{
 const {api}=setup();const entries=api.transcriptSegments({segments:JSON.stringify([{speaker:'customer',text:'Interested',start_seconds:5},{speaker:'user',text:'Hello',start_seconds:1},{speaker:'speaker_1',text:'Unknown voice',start_seconds:3},{speaker:'customer',text:'Partial',final:false}])});
 assert.deepEqual([...entries.map(e=>e.speaker)],['agent','unknown','prospect']);
 assert.deepEqual([...api.transcriptSegments({transcript:'Plain unlabelled text'}).map(e=>e.speaker)],['unknown']);
});
