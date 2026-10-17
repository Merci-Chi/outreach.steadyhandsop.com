import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../preview-resolver.js',import.meta.url),'utf8');
function setup(){
 const row={site_key:'ShS-Mixed_42',template_key:'plumbing',active:true};
 const lead={id:'lead',sitekey:row.site_key,assigned_user_id:'agent'},reads=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(table){const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>{reads.push({table,filters});return {data:row};},single:async()=>{reads.push({table,filters});return {data:lead};}};}};
 const window={steadyHandsCRMClient:client};vm.runInNewContext(source,{window,URL,Date,Map});return {api:window.SteadyHandsPreviews,row,lead,reads};
}
test('existing CRM site key is preserved exactly in preview and portal URLs',async()=>{
 const s=setup(),p=await s.api.resolveCRMDetails('lead');assert.equal(p.siteKey,'ShS-Mixed_42');
 assert.equal(new URL(p.previewUrl).href,'https://steadyhandsop.com/Previews/generic.html?sitekey=ShS-Mixed_42');
 assert.equal(new URL(p.portalUrl).href,'https://portal.steadyhandsop.com/index.html?sitekey=ShS-Mixed_42');
 assert(s.reads.find(x=>x.table==='crm').filters.some(([k,v])=>k==='assigned_user_id'&&v==='agent'));
});
test('sharing rechecks an active key instead of reusing cached success',async()=>{
 const s=setup();await s.api.resolveLeadDetails(s.lead);s.row.active=false;await assert.rejects(s.api.resolveLeadDetails(s.lead),/missing or inactive/);
});
test('missing keys, mismatched records and other representatives leads are rejected',async()=>{
 const s=setup();await assert.rejects(s.api.resolveLeadDetails({}),/no active site key/);
 s.row.site_key='different';await assert.rejects(s.api.resolveKey('ShS-Mixed_42',{fresh:true}),/missing or inactive/);
 s.lead.assigned_user_id='someone-else';await assert.rejects(s.api.resolveCRM('lead'),/not assigned/);
});
test('keys are encoded as a single query parameter and no database writes are needed',()=>{
 const {api}=setup(),key='existing&key=1';const u=new URL(api.templateUrl(key,'generic'));assert.equal(u.searchParams.get('sitekey'),key);assert.equal([...u.searchParams].length,1);
});
