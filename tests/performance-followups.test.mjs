import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../performance-followups.js',import.meta.url),'utf8');
function setup({crm=[],pipeline=[],calls=[],cap=500,leak=false,failTable}={}){
 const queries=[];const datasets={crm,sh_pipeline_records:pipeline,callcenter_call_activity:calls};
 const client={from(table){const req={table,filters:[]};queries.push(req);const q={select(){return q},order(){return q},eq(k,v){req.filters.push([k,v]);return q},in(k,v){req.ids=v;return q},async range(a,b){req.range=[a,b];if(table===failTable)return {error:new Error('Cannot read '+table)};let rows=datasets[table].filter(r=>(leak||req.filters.every(([k,v])=>r[k]===v))&&(!req.ids||req.ids.includes(r.id)));return {data:rows.slice(a,Math.min(b+1,a+cap))}}};return q}};
 const window={};vm.runInNewContext(source,{window});return {queries,load:userId=>window.steadyHandsLoadPerformanceFollowups({client,userId})};
}
const lead=(id,extra={})=>({id,company:id,stage:'called',...extra});
const call=(id,owner='a',outcome='follow_up',date='2026-10-19')=>({id:id+date,crm_id:id,user_id:owner,outcome,created_at:date});
const pipeline=(id,owner='a',stage='follow_up',extra={})=>({id:'p-'+id,crm_id:id,salesperson_user_id:owner,stage,...extra});
test('merges legacy callbacks, pipeline follow-ups and historical tagged calls once per associate and lead',async()=>{
 const p=setup({crm:[lead('legacy',{stage:'callback',callback_owner_id:'a'}),lead('pipeline'),lead('tagged'),lead('both',{stage:'callback',callback_owner_id:'a'})],pipeline:[pipeline('pipeline','a','follow_up',{follow_up_at:'2026-11-02T12:00:00Z',follow_up_category:'Interested'}),pipeline('both')],calls:[call('tagged'),call('both')]});
 const rows=await p.load('a');assert.deepEqual(Array.from(rows,r=>r.id).sort(),['both','legacy','pipeline','tagged']);assert.equal(rows.find(r=>r.id==='pipeline').follow_up_category,'Interested');assert.equal(rows.find(r=>r.id==='tagged').callbackdate,undefined);
});
test('does not resurrect older follow-up results after a later call or pipeline progression',async()=>{
 const p=setup({crm:[lead('later'),lead('advanced',{stage:'callback',callback_owner_id:'a'}),lead('pending')],calls:[call('later','a','follow_up','2026-10-18'),call('later','a','not_interested','2026-10-19'),call('advanced')],pipeline:[pipeline('advanced','a','ready_to_buy'),pipeline('pending')]});
 assert.deepEqual(Array.from(await p.load('a'),r=>r.id),['pending']);
});
test('suppressed and reassigned leads do not reappear for historical callers',async()=>{
 const p=setup({crm:[lead('dnc',{do_not_call:true}),lead('sold',{stage:'sold'}),lead('reassigned',{stage:'callback',callback_owner_id:'b'})],calls:[call('dnc'),call('sold'),call('reassigned')]});
 assert.equal((await p.load('a')).length,0);assert.deepEqual(Array.from(await p.load('b'),r=>r.id),['reassigned']);
});
test('Outreach scopes every source and rejects leaked rows from another associate',async()=>{
 const p=setup({crm:[lead('a'),lead('b')],pipeline:[pipeline('a'),pipeline('b','b')],calls:[call('b','b')],leak:true});
 const rows=await p.load('a');assert.deepEqual(Array.from(rows,r=>r.id),['a']);
 for(const [table,key] of [['crm','callback_owner_id'],['sh_pipeline_records','salesperson_user_id'],['callcenter_call_activity','user_id']])assert(p.queries.some(q=>q.table===table&&q.filters.some(([k,v])=>k===key&&v==='a')));
});
test('team view includes multiple associates and paginates past server caps',async()=>{
 const crm=Array.from({length:107},(_,i)=>lead('l'+i)),calls=crm.map((r,i)=>call(r.id,i%2?'a':'b'));
 const p=setup({crm,calls,cap:7});const rows=await p.load();assert.equal(rows.length,107);assert.equal(new Set(rows.map(r=>r.callback_owner_id)).size,2);assert(p.queries.some(q=>q.table==='callcenter_call_activity'&&q.range[0]>100));
});
test('source errors are surfaced instead of presenting incomplete data as an empty list',async()=>{
 await assert.rejects(setup({failTable:'sh_pipeline_records'}).load('a'),/Cannot read/);
});

test('team view uses current pipeline ownership instead of attributing the same lead to its previous caller',async()=>{
 const p=setup({crm:[lead('moved',{stage:'callback',callback_owner_id:'a'})],pipeline:[pipeline('moved','b')],calls:[call('moved','a')]});
 const rows=await p.load();assert.equal(rows.length,1);assert.equal(rows[0].callback_owner_id,'b');
});

test('a new follow-up result reopens an older pipeline stage, but not a newer stage change',async()=>{
 const p=setup({crm:[lead('reopened'),lead('completed')],pipeline:[pipeline('reopened','a','called',{updated_at:'2026-10-18'}),pipeline('completed','a','ready_to_buy',{updated_at:'2026-10-20'})],calls:[call('reopened'),call('completed')]});
 assert.deepEqual(Array.from(await p.load('a'),r=>r.id),['reopened']);
});
test('team view preserves unassigned legacy callbacks without exposing them in an individual view',async()=>{
 const p=setup({crm:[lead('unassigned',{stage:'callback',callback_owner_id:null})]});
 assert.equal((await p.load()).length,1);assert.equal((await p.load('a')).length,0);
});
