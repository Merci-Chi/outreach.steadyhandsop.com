import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {jsPDF}=require('../vendor/jspdf-2.5.2.umd.min.js');
const source=await readFile(new URL('../performance-transcript-export.js',import.meta.url),'utf8');
function setup({lazy=false,failFirst=false}={}){
 const pdfs=[],scripts=[],alerts=[];let scheduled=0;
 const Pdf=function(options){const pdf=new jsPDF(options);pdf.save=name=>pdfs.push({name,pdf});return pdf;};
 const window={jspdf:lazy?undefined:{jsPDF:Pdf}};
 const document={createElement:()=>({remove(){}}),head:{appendChild(script){scripts.push(script);if(failFirst&&scripts.length===1)script.onerror();else{window.jspdf={jsPDF:Pdf};script.onload();}}}};
 vm.runInNewContext(source,{window,document,Date,Blob,URL,alert:m=>alerts.push(m),prompt:()=> 'PDF',setTimeout:()=>++scheduled,clearTimeout(){}});
 return {api:window.SteadyHandsTranscriptExport,pdfs,scripts,alerts};
}
test('bundled library creates a readable multipage PDF for an older saved conversation',async()=>{
 const p=setup({lazy:true});
 await p.api.previous({id:'old-transcript',call_activity_id:null,company:'Earlier Company',started_at:'2026-01-01T10:00:00Z',ended_at:'2026-01-01T10:01:05Z',segments:[{speaker:'customer',text:'Historical conversation. '.repeat(1600)}]},'Current Company');
 assert.equal(p.alerts.length,0);assert.equal(p.scripts[0].src,'vendor/jspdf-2.5.2.umd.min.js');
 assert.equal(p.pdfs.length,1);const {pdf,name}=p.pdfs[0];assert.match(name,/\.pdf$/);assert.ok(pdf.getNumberOfPages()>1);
 const bytes=pdf.output();assert.match(bytes,/^%PDF-/);assert.match(bytes,/%%EOF/);
});
test('a failed local PDF load can be retried',async()=>{
 const p=setup({lazy:true,failFirst:true});const call={id:'a',lead:'Lead'};const transcript={transcript:'Saved plain text'};
 await p.api.single(call,transcript);assert.equal(p.alerts.length,1);
 await p.api.single(call,transcript);assert.equal(p.scripts.length,2);assert.equal(p.pdfs.length,1);
});
test('history reads past 200 records while retaining company and account filters',async()=>{
 const p=setup(),queries=[];
 const rows=Array.from({length:401},(_,i)=>({id:String(i)}));
 const client={from(table){const q={table,filters:[],orders:[]};queries.push(q);const chain={select(){return chain},eq(k,v){q.filters.push([k,v]);return chain},order(k){q.orders.push(k);return chain},async range(a,b){q.range=[a,b];return {data:rows.slice(a,b+1),error:null}}};return chain;}};
 const result=await p.api.history(client,'company-1','account-1');assert.equal(result.data.length,401);
 assert.deepEqual(queries.map(q=>q.range),[[0,199],[200,399],[400,599]]);
 for(const q of queries){assert.deepEqual(q.filters,[['crm_id','company-1'],['user_id','account-1']]);assert.deepEqual(q.orders,['created_at','id']);}
});
test('history query failures are reported instead of exporting partial history',async()=>{
 const p=setup();const error={message:'denied'};
 const chain={select(){return this},eq(){return this},order(){return this},async range(){return {data:null,error}}};
 const result=await p.api.history({from:()=>chain},'company-1','account-1');assert.equal(result.error,error);assert.equal(result.data.length,0);
});
