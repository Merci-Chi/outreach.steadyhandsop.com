import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const actionSource=await readFile(new URL('../performance-followup-actions.js',import.meta.url),'utf8');
const followupSource=await readFile(new URL('../performance-followups.js',import.meta.url),'utf8');
const source=await readFile(new URL('../performance-history.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({calls=205,followups=101,failFirstCall=false}={}){
 const queries=[],nodes=new Map(),handlers={},opened=[];
 const node=()=>({value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,attributes:{},addEventListener(){},setAttribute(k,v){this.attributes[k]=v}});
 const tabs=['calls','followups'].map(kind=>({...node(),dataset:{historyView:kind}}));
 const root={dataset:{},innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)},querySelectorAll(){return tabs},addEventListener(k,fn){handlers[k]=fn}};
 const datasets={sh_pipeline_records:[],callcenter_call_activity:Array.from({length:calls},(_,i)=>({id:'call-'+i,user_id:'own',crm_id:'lead-'+i,created_at:'2026-10-19',duration_seconds:i,outcome:'called'})),crm:Array.from({length:Math.max(calls,followups)},(_,i)=>({id:'lead-'+i,company:'Business '+i,phone:'555-1000',callback_owner_id:i<followups?'own':'other',stage:'callback'})),callcenter_transcripts:Array.from({length:calls},(_,i)=>({id:'t-'+i,call_activity_id:'call-'+i,user_id:'own'}))};
 let failed=false;
 const client={from(table){const query={table,filters:[],orders:[]};queries.push(query);const chain={select(fields,options){query.options=options;return chain},eq(k,v){query.filters.push([k,v]);return chain},order(k,o){query.orders.push([k,o]);return chain},in(k,v){query.in=[k,v];return chain},range(a,b){query.range=[a,b];return Promise.resolve(response())},then(resolve,reject){return Promise.resolve(response()).then(resolve,reject)}};
 function response(){if(failFirstCall&&!failed&&table==='callcenter_call_activity'){failed=true;return {error:{message:'offline'}}}let rows=datasets[table].filter(row=>query.filters.every(([k,v])=>row[k]===v));if(query.in)rows=rows.filter(row=>query.in[1].includes(row[query.in[0]]));return {data:query.range?rows.slice(query.range[0],query.range[1]+1):rows,count:rows.length}}return chain}};
 const window={steadyHandsOpenPerformanceCall:args=>opened.push(args)};vm.runInNewContext(actionSource,{window});vm.runInNewContext(followupSource,{window});vm.runInNewContext(source,{window,URLSearchParams,Date});
 return {root,queries,opened,tabs,datasets,init:()=>window.steadyHandsMountPerformanceHistory({client,userId:'own',displayName:'My Name',root}),node:(kind,part)=>root.querySelector(`[data-history-${part}="${kind}"]`),async click(dataset){handlers.click({target:{closest:()=>({dataset})}});await tick();await tick()}};
}
test('calls and follow-ups independently request 100 owned rows with stable order',async()=>{
 const p=setup();await p.init();
 for(const [table,key] of [['callcenter_call_activity','user_id'],['crm','callback_owner_id']]){
  const q=p.queries.find(q=>q.table===table&&q.range);assert.deepEqual(q.range,table==='crm'?[0,499]:[0,99]);assert(q.filters.some(([k,v])=>k===key&&v==='own'));assert(q.orders.some(([k])=>k==='id'));
 }
 assert.equal((p.node('calls','list').innerHTML.match(/data-history-call=/g)||[]).length,100);
 assert.equal((p.node('followups','list').innerHTML.match(/<article/g)||[]).length,100);
 assert.match(p.node('calls','list').innerHTML,/My Name/);assert.match(p.node('calls','list').innerHTML,/Transcript/);
 await p.click({historyMore:'calls'});assert.match(p.node('calls','count').textContent,/200 of 205/);assert.match(p.node('followups','count').textContent,/100 of 101/);
 await p.click({historyMore:'calls'});assert.equal(p.node('calls','more').hidden,true);assert.match(p.node('calls','count').textContent,/205 of 205/);
 await p.click({historyMore:'followups'});assert.equal(p.node('followups','more').hidden,true);
});
test('all history remains reachable beyond the old 1000-call and 500-follow-up caps',async()=>{
 const p=setup({calls:1105,followups:505});await p.init();
 for(let i=0;i<11;i++)await p.click({historyMore:'calls'});
 for(let i=0;i<5;i++)await p.click({historyMore:'followups'});
 assert.match(p.node('calls','count').textContent,/1105 of 1105/);assert.match(p.node('followups','count').textContent,/505 of 505/);
 assert.match(p.node('calls','list').innerHTML,/call-1104/);assert.match(p.node('followups','list').innerHTML,/Business 504/);
});
test('a failed page retries the same range without losing rows or duplicating calls',async()=>{
 const p=setup({failFirstCall:true});await p.init();assert.match(p.node('calls','status').textContent,/retry/);assert.equal(p.node('calls','more').disabled,false);
 await p.click({historyMore:'calls'});assert.deepEqual(p.queries.filter(q=>q.table==='callcenter_call_activity'&&q.options?.count).map(q=>q.range),[[0,99],[0,99]]);assert.match(p.node('calls','count').textContent,/100 of 205/);
});
test('mobile toggle preserves each list and detail requests use the signed-in account',async()=>{
 const p=setup();await p.init();await p.click({historyView:'followups'});assert.equal(p.root.dataset.view,'followups');assert.equal(p.tabs[1].attributes['aria-pressed'],'true');
 await p.click({historyView:'calls'});await p.click({historyCall:'call-1'});assert.equal(p.opened[0].userId,'own');assert.equal(p.opened[0].activityId,'call-1');
 await p.click({historyCall:'not-loaded-other-user'});assert.equal(p.opened.length,1);
});
test('Performance ignores teammate query parameters and mounts only the session user',async()=>{
 const data=await readFile(new URL('../user-data.js',import.meta.url),'utf8');const fn=data.slice(data.indexOf('  async function loadActivity('),data.indexOf('  async function loadPersonalOutreachStats('));
 const filters=[],mounted=[],main={innerHTML:''};const query={select(){return query},eq(k,v){filters.push([k,v]);return query},order(){return query},limit:async()=>({data:[]})};
 await vm.runInNewContext(fn+';loadActivity({user:{id:"own"}},{display_name:"Me"})',{client:()=>({from:()=>query}),document:{title:'Performance',getElementById:()=>main},window:{steadyHandsMountPerformanceHistory:args=>mounted.push(args)},location:{search:'?user=someone-else'},Date});
 assert(filters.some(([k,v])=>k==='user_id'&&v==='own'));assert.equal(mounted[0].userId,'own');assert(!main.innerHTML.includes('Selected teammate'));
});
test('rapid Load more clicks issue only one request for the next page',async()=>{
 const p=setup();await p.init();await Promise.all([p.click({historyMore:'calls'}),p.click({historyMore:'calls'})]);
 assert.deepEqual(p.queries.filter(q=>q.table==='callcenter_call_activity'&&q.options?.count).map(q=>q.range),[[0,99],[100,199]]);
 assert.match(p.node('calls','count').textContent,/200 of 205/);
});
test('empty lists finish cleanly without offering an endless Load more button',async()=>{
 const p=setup({calls:0,followups:0});await p.init();for(const kind of ['calls','followups']){assert.equal(p.node(kind,'more').hidden,true);assert.equal(p.node(kind,'count').textContent,'0 of 0')}
});

test('pipeline follow-ups and tagged call results appear even without a legacy callback stage',async()=>{
 const p=setup({calls:2,followups:0});
 p.datasets.crm.forEach(r=>{r.stage='called';r.callback_owner_id=null});
 p.datasets.sh_pipeline_records.push({id:'pipeline-0',crm_id:'lead-0',salesperson_user_id:'own',stage:'follow_up',follow_up_at:'2026-11-02T12:00:00Z',follow_up_category:'Interested'});
 p.datasets.callcenter_call_activity[1].outcome='follow_up';
 await p.init();assert.equal(p.node('followups','count').textContent,'2 of 2');assert.match(p.node('followups','list').innerHTML,/Business 0/);assert.match(p.node('followups','list').innerHTML,/Business 1/);assert.match(p.node('followups','list').innerHTML,/Interested/);assert.match(p.node('followups','list').innerHTML,/Date not set/);
});
test('follow-up cards reuse call-details/transcript controls even when the associated call is not in loaded Recent Calls',async()=>{
 const p=setup({calls:205,followups:0});p.datasets.crm.forEach(r=>{r.stage='called';r.callback_owner_id=null});p.datasets.callcenter_call_activity[204].outcome='follow_up';
 await p.init();const html=p.node('followups','list').innerHTML;assert.match(html,/class="performance-history-call"/);assert.match(html,/data-history-call="call-204"/);assert.match(html,/Transcript/);assert.match(html,/Add to calendar/);assert.match(html,/Add to tasks/);
 await p.click({historyCall:'call-204'});assert.equal(p.opened[0].activityId,'call-204');assert.equal(p.opened[0].userId,'own');
});
