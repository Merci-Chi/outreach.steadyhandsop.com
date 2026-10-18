import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../sales-pipeline.js',import.meta.url),'utf8');
function setup(rows=[],error=null){
 const requests=[],timers=[],window={};
 const source=original.replace(/if\(document.readyState==='loading'\)[\s\S]*$/,`window.api={processStage,loadProcessChecks,mount(client,contacts){db=client;records=contacts;}};})();`);
 vm.runInNewContext(source,{window,document:{},console:{warn(){}},setTimeout:fn=>timers.push(fn)});
 const client={from(table){const request={table};requests.push(request);const q={select(){return q},in(_,ids){request.ids=ids;return q},order(){return q},range(start,end){return Promise.resolve(error?{error}:{data:rows.filter(r=>request.ids.includes(r.crm_id)).slice(start,end+1)})}};return q;}};
 return {api:window.api,client,requests,timers};
}
test('pipeline uses the first incomplete process step and keeps clients isolated',async()=>{
 const s=setup([{crm_id:'a',step_no:1,is_checked:true},{crm_id:'a',step_no:2,is_checked:true},{crm_id:'a',step_no:4,is_checked:true},{crm_id:'b',step_no:1,is_checked:false}]);
 s.api.mount(s.client,[{crm_id:'a'},{crm_id:'b'}]);assert.equal(s.api.processStage({crm_id:'a'}),'Process: Loading…');
 await s.api.loadProcessChecks();
 assert.equal(s.api.processStage({crm_id:'a'}),'Process: Step 3 / 6 — Collect a textable number · 3 / 6 complete');
 assert.match(s.api.processStage({crm_id:'b'}),/Step 1 \/ 6.*0 \/ 6 complete/);
 assert.equal(s.api.processStage({}),'Process: No linked prospect');
});
test('all six manual checks are required for a completed process',async()=>{
 const s=setup(Array.from({length:6},(_,i)=>({crm_id:'a',step_no:i+1,is_checked:true})));
 s.api.mount(s.client,[{crm_id:'a'}]);await s.api.loadProcessChecks();
 assert.equal(s.api.processStage({crm_id:'a'}),'Process complete · 6 / 6');
});
test('stage reads batch linked CRM IDs and paginate all six rows for every client',async()=>{
 const contacts=Array.from({length:101},(_,i)=>({crm_id:String(i)}));
 const s=setup(contacts.flatMap(r=>Array.from({length:6},(_,i)=>({...r,step_no:i+1,is_checked:true}))));
 s.api.mount(s.client,contacts);await s.api.loadProcessChecks();assert.equal(s.requests.length,3);
 assert(s.requests.every(r=>r.table==='outreach_process_checks'&&r.ids.length<=100));
 assert.equal(s.api.processStage({crm_id:'99'}),'Process complete · 6 / 6');assert.equal(s.api.processStage({crm_id:'100'}),'Process complete · 6 / 6');
});
test('failed stage reads keep loading and schedule a retry instead of inventing progress',async()=>{
 const s=setup([],{message:'Network error'});s.api.mount(s.client,[{crm_id:'a'}]);await s.api.loadProcessChecks();
 assert.equal(s.api.processStage({crm_id:'a'}),'Process: Loading…');assert.equal(s.timers.length,1);
});
