import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../my-leads.js',import.meta.url),'utf8');
const fetchSource=source.slice(source.indexOf('  async function fetchAssignedRows()'),source.indexOf('  function matchedAssignedRows'));
const dateSource=source.slice(source.indexOf('  function createdValue('),source.indexOf('  function applyClientSort('));
test('My Leads queries the actual created column once per batch and keeps ownership filters',async()=>{
 const requests=[],rows=Array.from({length:1001},(_,id)=>({id,created:'2026-10-19'}));
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},from(table){const req={table};requests.push(req);const q={
  select(columns){req.columns=columns;return q},eq(key,value){req.filter=[key,value];return q},order(){return q},
  range(start,end){req.range=[start,end];return Promise.resolve({data:rows.slice(start,end+1)})}
 };return q}};
 const c=vm.createContext({client});vm.runInContext(fetchSource+dateSource+';this.fetchRows=fetchAssignedRows;this.createdValue=createdValue;',c);
 const found=await c.fetchRows();assert.equal(found.length,1001);assert.equal(requests.length,2);
 assert(requests.every(r=>r.columns.split(',').includes('created')&&!r.columns.split(',').includes('created_at')));
 assert(requests.every(r=>r.filter[0]==='assigned_user_id'&&r.filter[1]==='agent'));
 assert.equal(c.createdValue({created:'2026-10-19'}),Date.parse('2026-10-19'));
 assert.equal(c.createdValue({created:null}),null);
});
