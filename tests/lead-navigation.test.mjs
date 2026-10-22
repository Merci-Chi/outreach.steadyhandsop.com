import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../lead-navigation.js',import.meta.url),'utf8');
function setup({page='index.html',rows=null,busy=false,error=null,onRead=null,calls=[]}={}) {
 const handlers={},nodes={},filters=[],routes=[],saved=new Map();let reads=0;
 for(const id of ['refPreviouslyCalled','refRandomLead','refNextQueue','leadNavigationStatus'])nodes[id]={disabled:false,hidden:true,addEventListener:(name,fn)=>handlers[id]=fn};
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(table){
  const q={select:()=>q,eq:(key,value)=>(table==='crm'&&filters.push([key,value]),q),not:()=>q,order:()=>q,limit:async()=>{if(table==='callcenter_call_activity')return {data:calls,error:null};reads++;await onRead?.(window);return {data:rows||[{id:'a',company:'A',phone:'5550000000'},{id:'blocked',blocked:true,phone:'5551111111'},{id:'b',company:'B',phone:'+17025550102',timezone:'America/Los_Angeles',name:'Pat'}],error}}};return q;
 }};
 const location={pathname:'/'+page,search:'?crm_id=a',assign:url=>routes.push(url)};
 const window={location,steadyHandsCRMClient:client,SteadyHandsLeadDisposition:{blocked:row=>row.blocked},SteadyHandsInboundVoice:{isActive:()=>busy}};
 vm.runInNewContext(source,{window,location,URLSearchParams,sessionStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},document:{readyState:'complete',getElementById:id=>nodes[id],querySelector:()=>null},console:{error(){}},Math:Object.assign(Object.create(Math),{random:()=>0})});
 return {window,nodes,filters,routes,saved,reads:()=>reads,click:id=>handlers[id]()};
}
for(const page of ['index.html','call.html'])test('both pages use the same controls and shared controller: '+page,async()=>{
 const html=await readFile(new URL('../'+page,import.meta.url),'utf8');
 assert.equal((html.match(/id="outreachLeadDock"/g)||[]).length,1);
 for(const id of ['refPreviouslyCalled','refRandomLead','refNextQueue','inboundCallSlot'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(html,/lead-navigation\.js\?v=/);assert.match(html,/lead-navigation\.css\?v=/);
 const other=await readFile(new URL('../'+(page==='index.html'?'call.html':'index.html'),import.meta.url),'utf8');
 assert.equal(html.match(/<nav id="outreachLeadDock"[\s\S]*?<\/nav>/)[0],other.match(/<nav id="outreachLeadDock"[\s\S]*?<\/nav>/)[0]);
});
for(const button of ['refRandomLead','refNextQueue'])test(button+' selects an assigned eligible prospect on the main page',async()=>{
 const s=setup();await s.click(button);assert.equal(s.routes[0],'index.html?crm_id=b');assert.deepEqual(s.filters,[['assigned_user_id','agent']]);assert.equal(s.saved.get('steadyhands-selected-outreach-crm-id'),'b');
});
test('call page keeps navigation on call.html and supplies the new lead metadata',async()=>{
 const s=setup({page:'call.html'});await s.click('refNextQueue');const url=new URL(s.routes[0],'https://example.com');
 assert.equal(url.pathname,'/call.html');assert.equal(url.searchParams.get('crm_id'),'b');assert.equal(url.searchParams.get('number'),'+17025550102');assert.equal(url.searchParams.get('timezone'),'America/Los_Angeles');assert.equal(JSON.parse(s.saved.get('steadyhands-outreach-call-handoff')).id,'b');
});
test('Next wraps to the first lead in a stable queue',async()=>{
 const s=setup({rows:[{id:'b',phone:'5559999999'},{id:'a',phone:'5551112222'}]});await s.click('refNextQueue');assert.equal(s.routes[0],'index.html?crm_id=b');
});
test('active calls prevent lookups and call arrival during lookup prevents navigation',async()=>{
 const active=setup({busy:true});await active.click('refRandomLead');assert.equal(active.reads(),0);assert.equal(active.routes.length,0);
 const arriving=setup({onRead:window=>{window.SteadyHandsInboundVoice.isActive=()=>true;}});await arriving.click('refNextQueue');assert.equal(arriving.routes.length,0);assert.match(arriving.nodes.leadNavigationStatus.textContent,/Finish the current call/);
});
test('errors and empty eligibility recover controls and display feedback',async()=>{
 for(const options of [{error:{message:'CRM unavailable'}},{rows:[{id:'blocked',blocked:true}]}]){
  const s=setup(options);await s.click('refNextQueue');assert.equal(s.routes.length,0);assert.equal(s.nodes.refNextQueue.disabled,false);assert.equal(s.nodes.leadNavigationStatus.hidden,false);
 }
});
test('duplicate clicks submit only one lookup',async()=>{
 const s=setup();const pending=s.click('refNextQueue');await s.click('refRandomLead');await pending;assert.equal(s.reads(),1);assert.equal(s.routes.length,1);
});

test('previously contacted leads stay out of new-lead navigation',async()=>{
 const s=setup({rows:[{id:'a',phone:'111',lastcalled:'2026-10-20T10:00:00Z'},{id:'b',phone:'222',outcome:'Left Voicemail'},{id:'c',phone:'333'}],calls:[{crm_id:'b',outcome:'called'}]});
 await s.click('refNextQueue');assert.equal(s.routes[0],'index.html?crm_id=c');
});
test('previously called no-answer selection is separate from fresh queue',async()=>{
 const s=setup({rows:[{id:'a',phone:'111',lastcalled:'2026-10-20T10:00:00Z',outcome:'Left Voicemail'},{id:'b',phone:'222'}]});
 await s.click('refPreviouslyCalled');assert.match(s.routes[0],/^index.html\\?crm_id=a&retry_no_answer=1$/);
});
