import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../queue-outreach.js',import.meta.url),'utf8');
test('Next in Queue uses assigned-lead navigation when no custom queue exists',async()=>{
 const handlers={},alerts=[];let advances=0;
 const nodes={shQueueNext:{addEventListener:(event,fn)=>handlers.next=fn},shQueueProgress:{}};
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(){
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null})};return q;
 }};
 const window={steadyHandsCRMClient:client,SteadyHandsLeadNavigation:{next:async()=>{advances++}},addEventListener(){}};
 vm.runInNewContext(source.replace('function mount(){','window.advanceForTest=advance;\nfunction mount(){'),{window,document:{body:{classList:{contains:()=>true}},readyState:'complete',getElementById:id=>nodes[id],querySelector:()=>({})},alert:text=>alerts.push(text),console});
 await window.advanceForTest();
 assert.equal(advances,1);assert.deepEqual(alerts,[]);assert.equal(nodes.shQueueNext.disabled,false);
 assert.match(nodes.shQueueProgress.textContent,/Assigned leads/);
});
