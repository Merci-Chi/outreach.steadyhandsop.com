import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const disposition=await readFile(new URL('../lead-disposition.js',import.meta.url),'utf8');
const queue=await readFile(new URL('../queue.js',import.meta.url),'utf8');
function setup(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',style:{}});return nodes.get(id)};
 const window={};const context=vm.createContext({window,document:{getElementById:node}});vm.runInContext(disposition,context);
 const code=queue.slice(0,queue.indexOf("document.addEventListener('click'"))+`window.api={paintQueueItems,previewItems,generate,configure(c){client=c;user={id:'agent'};selectedQueueId='queue';load=async()=>{}}};})();`;
 vm.runInContext(code,context);return {window,node};
}
test('queue shows Called and correct completion even when the item status is stale',async()=>{
 const s=setup();const items=[{id:'item1',crm_id:'called',status:'pending',company_name:'Called business'},{id:'item2',crm_id:'new',status:'pending',company_name:'New business'}];
 const leads=[{id:'called',tags:['Called'],lastcalled:'2026-10-22T12:00:00Z'},{id:'new',tags:[],lastcalled:null}];
 s.window.api.configure({from(table){const result={select:()=>result,eq:()=>result,in:()=>result,order:()=>result,limit:()=>result,then:resolve=>resolve({data:table==='crm'?leads:items})};return result;}});
 await s.window.api.previewItems({id:'queue'});
 assert.equal(s.node('qComplete').textContent,1);assert.equal(s.node('qRemaining').textContent,1);
 assert.match(s.node('qItemsPreview').innerHTML,/Called business[\s\S]*?Called/);
 assert.match(s.node('qItemsPreview').innerHTML,/New business[\s\S]*?Not called/);
 assert.doesNotMatch(s.node('qItemsPreview').innerHTML,/Not attempted/);
});
test('Exclude Called generates fresh leads while skipping previously called leads',async()=>{
 const s=setup(),inserted=[];
 const leads=[{id:'fresh',company:'Fresh',tags:[],lastcalled:null},{id:'called',tags:['Called'],lastcalled:null}];
 s.window.api.configure({from(table){const result={select:()=>result,eq:()=>result,is:()=>result,order:()=>result,limit:()=>result,upsert:rows=>{inserted.push(...rows);return result},then:resolve=>resolve({data:table==='crm'?leads:[]})};return result;}});
 await s.window.api.generate({id:'queue',name:'Fresh queue',filters:{exclude_called:true}});
 assert.deepEqual(inserted.map(row=>row.crm_id),['fresh']);
});
