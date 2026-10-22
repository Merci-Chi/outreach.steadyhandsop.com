import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../queue.js',import.meta.url),'utf8');
function setup(){
 const nodes=new Map(),calls=[],rows=[{id:'one',name:'One',is_active:true,filters:{}},{id:'two',name:'Two',is_active:false,filters:{}}];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},innerHTML:'',textContent:'',checked:false,disabled:false});return nodes.get(id)};
 const state={error:null};
 const client={from(table){const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,then:resolve=>resolve({data:table==='outreach_queues'?rows:[]})};return q;},async rpc(name,args){calls.push({name,args});if(state.error)return {error:{message:state.error}};for(const row of rows){if(row.id===args.p_queue_id)row.is_active=args.p_active;else if(args.p_active)row.is_active=false;}return {data:rows.find(row=>row.id===args.p_queue_id)};}};
 const window={};const context=vm.createContext({window,document:{getElementById:node,querySelectorAll:()=>[]},console});
 const code=source.slice(0,source.indexOf("document.addEventListener('click'"))+`window.api={render,chooseQueue,setQueueActive,selectedQueue,configure(){client=window.client;user={id:'agent'};queues=window.rows;}};})();`;
 window.client=client;window.rows=rows;vm.runInContext(code,context);window.api.configure();
 return {api:window.api,node,calls,rows,state};
}
test('selecting an inactive queue inspects it without activating it',async()=>{
 const s=setup();await s.api.chooseQueue('two');
 assert.equal(s.calls.length,0);assert.equal(s.rows[0].is_active,true);assert.equal(s.node('qActiveSetting').checked,false);assert.equal(s.node('qActiveStatus').textContent,'Inactive');
 assert.match(s.node('qList').innerHTML,/>Inactive<\/small>/);
});
test('the explicit status control saves Active and Inactive through the atomic RPC',async()=>{
 const s=setup();await s.api.chooseQueue('two');await s.api.setQueueActive(s.api.selectedQueue(),true);
 assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0])),{name:'outreach_set_queue_active',args:{p_queue_id:'two',p_active:true}});
 assert.equal(s.rows[0].is_active,false);assert.equal(s.node('qActiveSetting').checked,true);assert.equal(s.node('qActiveStatus').textContent,'Active');
 await s.api.setQueueActive(s.api.selectedQueue(),false);assert.equal(s.node('qActiveSetting').checked,false);assert(s.rows.every(q=>!q.is_active));
});
test('a failed status save restores the saved state and explains the failure',async()=>{
 const s=setup();await s.api.chooseQueue('two');s.state.error='Connection failed';s.node('qActiveSetting').checked=true;await s.api.setQueueActive(s.api.selectedQueue(),true);
 assert.equal(s.rows[0].is_active,true);assert.equal(s.rows[1].is_active,false);assert.equal(s.node('qActiveSetting').checked,false);assert.equal(s.node('qActiveSetting').disabled,false);assert.match(s.node('qMessage').textContent,/Connection failed/);
});
