import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../action-needed-api.js',import.meta.url),'utf8');
function setup(search,assignment){
 const calls=[];
 const query={select(value){calls.push(['select',value]);return this;},eq(...args){calls.push(['eq',...args]);return this;},in(){return this;},order(...args){calls.push(['order',...args]);return this;},limit(value){calls.push(['limit',value]);return this;},maybeSingle:async()=>({data:assignment,error:null})};
 const window={location:{search},steadyHandsCRMClient:{auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){calls.push(['from',table]);return query;}}};
 vm.runInNewContext(source,{window,URLSearchParams});return {api:window.OutreachActions,calls};
}
test('an explicit assignment is scoped to its owner and uses its own agreement and date',async()=>{
 const {api,calls}=setup('?assignment=older',{id:'older',user_id:'owner',status:'assigned',current_basis:'hourly',start_date:'2026-11-02'});
 const result=await api.load();assert.equal(result.assignment.id,'older');assert.equal(result.associate.start_date,'2026-11-02');
 assert(calls.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]==='older'));
 assert(calls.some(x=>x[0]==='eq'&&x[1]==='user_id'&&x[2]==='owner'));
 assert.equal(calls.filter(x=>x[0]==='from').length,1);
});
test('unknown explicit IDs never fall back to another action',async()=>{
 const {api,calls}=setup('?assignment=missing',null);assert.equal((await api.load()).assignment,null);
 assert.equal(calls.filter(x=>x[0]==='from').length,1);assert(!calls.some(x=>x[0]==='limit'));
});
test('legacy links select one pending action; popup IDs override the URL',async()=>{
 const legacy=setup('',null);await legacy.api.load();assert(legacy.calls.some(x=>x[0]==='limit'&&x[1]===1));
 const explicit=setup('?assignment=wrong',null);await explicit.api.load('selected');
 assert(explicit.calls.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]==='selected'));
});
