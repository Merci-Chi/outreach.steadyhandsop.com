import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const [source,navigation,disposition]=await Promise.all(['queue-outreach.js','lead-navigation.js','lead-disposition.js'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
function rig({active=null,items=[],rows=[],history=[],error=null,page='index.html',busy=false}={}){
 const routes=[],queries=[],nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,hidden:true,textContent:'',dataset:{}});return nodes.get(id)};
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(table){const filters=[];queries.push({table,filters});const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q},in:()=>q,not:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:active,error}),then:resolve=>resolve({data:table==='outreach_queue_items'?items:table==='crm'?rows:history,error})};return q;}};
 const location={pathname:'/'+page,search:'?crm_id=current',assign:url=>routes.push(url)};
 const window={location,steadyHandsCRMClient:client,SteadyHandsTwilioVoice:{isActive:()=>busy},addEventListener(){}};
 const context=vm.createContext({window,location,URLSearchParams,sessionStorage:{setItem(){}},document:{readyState:'loading',addEventListener(){},getElementById:node,querySelector:()=>null},console:{error(){}}});
 for(const script of [disposition,source,navigation])vm.runInContext(script,context);
 return {routes,queries,node,next:()=>window.SteadyHandsLeadNavigation.next()};
}
test('no active queue falls back to assigned uncalled leads',async()=>{
 const s=rig({rows:[{id:'fresh',phone:'111'}]});await s.next();assert.equal(s.routes[0],'index.html?crm_id=fresh');
 assert.match(s.node('shQueueProgress').textContent,/No active queue/);
});
for(const page of ['index.html','call.html'])test('active queue controls the shared Next button on '+page,async()=>{
 const s=rig({page,active:{id:'active',name:'Chosen',filters:{}},items:[{crm_id:'second',status:'pending'},{crm_id:'first',status:'pending'}],rows:[{id:'outside',phone:'999'},{id:'first',phone:'111'},{id:'second',phone:'222'}]});
 await s.next();assert.match(s.routes[0],/crm_id=second/);
 assert(s.queries.filter(q=>q.table==='crm').every(q=>q.filters.some(([k,v])=>k==='assigned_user_id'&&v==='agent')));
});
test('include contacted permits follow-up entries even when marked completed by lifetime call status',async()=>{
 const s=rig({active:{id:'active',name:'Follow-ups',filters:{exclude_called:false}},items:[{crm_id:'callback',status:'completed'}],rows:[{id:'callback',phone:'111',stage:'callback',tags:['Interested','Called'],lastcalled:'2026-10-21T20:00:00Z'}]});
 await s.next();assert.equal(s.routes[0],'index.html?crm_id=callback&follow_up=1');
});
test('exclude contacted skips called leads and activity-only prior calls',async()=>{
 const s=rig({active:{id:'active',name:'Fresh',filters:{exclude_called:true}},items:['called','history','fresh'].map(crm_id=>({crm_id,status:'pending'})),rows:[{id:'called',phone:'111',lastcalled:'2026-10-21T20:00:00Z'},{id:'history',phone:'222'},{id:'fresh',phone:'333'}],history:[{crm_id:'history',outcome:'called'}]});
 await s.next();assert.equal(s.routes[0],'index.html?crm_id=fresh');
});
test('active queue never falls through to outside leads when empty or ineligible',async()=>{
 for(const items of [[],[{crm_id:'bad',status:'pending'}]]){
  const s=rig({active:{id:'active',name:'Chosen',filters:{}},items,rows:[{id:'bad',phone:'111',tags:['DNC']},{id:'outside',phone:'999'}]});await s.next();assert.equal(s.routes.length,0);assert.match(s.node('leadNavigationStatus').textContent,/empty|No eligible/);
 }
});
test('failed queue lookup cannot silently bypass queue state',async()=>{
 const s=rig({error:{message:'Queue lookup failed'},rows:[{id:'outside',phone:'999'}]});await s.next();assert.equal(s.routes.length,0);assert.match(s.node('leadNavigationStatus').textContent,/Queue lookup failed/);
});
test('active calls prevent queue reads and navigation',async()=>{
 const s=rig({busy:true});await s.next();assert.equal(s.queries.length,0);assert.equal(s.routes.length,0);
});
test('saved alphabetical order is used by Next',async()=>{
 const s=rig({active:{id:'active',name:'Alphabetical',filters:{},sort_mode:'az'},items:[{crm_id:'z',status:'pending'},{crm_id:'a',status:'pending'}],rows:[{id:'z',company:'Z',phone:'111'},{id:'a',company:'A',phone:'222'}]});await s.next();assert.equal(s.routes[0],'index.html?crm_id=a');
});
