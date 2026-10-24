import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../performance-call-details.js',import.meta.url),'utf8');
function setup({missingCall=false,transcriptError=false,plain=false}={}){
 const queries=[],listeners=new Map(),exports=[];let overlay;
 const control=()=>({disabled:false,textContent:'',handlers:{},addEventListener(k,fn){this.handlers[k]=fn},focus(){}});
 const currentExport=control(),previousExport={...control(),dataset:{previousExport:'0'}};
 const oldTranscript={id:'old-transcript',call_activity_id:null,transcript:'Earlier saved conversation'};
 const nodes={body:{querySelector(){return currentExport},querySelectorAll(){return [previousExport]},innerHTML:'',textContent:'',removeAttribute(){},setAttribute(){}},title:{textContent:''},sheet:{focus(){}},close:control(),head:{after(){}},prev:control(),next:control(),position:{textContent:''}};
 const document={activeElement:null,createElement(tag){if(tag==='nav')return {className:'',setAttribute(){},innerHTML:'',querySelector(s){return s==='[data-call-prev]'?nodes.prev:s==='[data-call-next]'?nodes.next:nodes.position}};overlay={isConnected:false,innerHTML:'',className:'',querySelector(s){return s==='.performance-call-body'?nodes.body:s==='#performanceCallTitle'?nodes.title:s==='[role="dialog"]'?nodes.sheet:s==='.activity-transcript-head'?nodes.head:nodes.close},addEventListener(){},querySelectorAll(){return [nodes.close,nodes.prev,nodes.next]},remove(){this.isConnected=false}};return overlay},body:{appendChild(el){el.isConnected=true}},addEventListener(k,fn){listeners.set(k,fn)},removeEventListener(k){listeners.delete(k)}};
 const rows={callcenter_call_activity:{id:'activity-1',user_id:'associate-1',crm_id:'lead-1',duration_seconds:65,outcome:'Called',call_sid:'CAexisting',created_at:'2026-10-19T16:00:00Z'},crm:{company:'Existing business',phone:'555-1234',notes:'<script>bad()</script>'},callcenter_transcripts:{id:'transcript-1',call_activity_id:'activity-1',transcript:plain?'Saved plain text':'',segments:plain?[]:[{speaker:'agent',text:'Hello <img src=x>'},{speaker:'customer',text:'Thanks.'}]}};
 const client={from(table){const query={table,filters:[]};queries.push(query);const chain={select(value){query.select=value;return chain},eq(k,v){query.filters.push([k,v]);return chain},order(){return chain},limit(){return chain},async maybeSingle(){return {data:missingCall&&table==='callcenter_call_activity'?null:rows[table],error:transcriptError&&table==='callcenter_transcripts'?{message:'denied'}:null}}};return chain}};
 const window={SteadyHandsTranscriptExport:{history:async()=>({data:[oldTranscript],error:null}),single:(call,transcript)=>exports.push({call,transcript}),previous:(transcript,lead)=>exports.push({transcript,lead})}};vm.runInNewContext(source,{window,document,Date});
 return {queries,nodes,listeners,exports,currentExport,previousExport,oldTranscript,get overlay(){return overlay},open:()=>window.steadyHandsOpenPerformanceCall({client,activityId:'activity-1',userId:'associate-1'})};
}
test('existing owned call details render saved segments, notes, and all identifiers without writes',async()=>{
 const p=setup();await p.open();assert.equal(p.nodes.title.textContent,'Existing business');
 for(const value of ['Customer','You','Thanks.','Activity ID','activity-1','Transcript ID','transcript-1','Twilio CallSid','CAexisting','1m 5s'])assert.ok(p.nodes.body.innerHTML.includes(value),value);
 assert.match(p.nodes.body.innerHTML,/&lt;img src=x&gt;/);assert.match(p.nodes.body.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(p.nodes.body.innerHTML,/<script>|<img/);
 for(const table of ['callcenter_call_activity','callcenter_transcripts'])assert.ok(p.queries.find(q=>q.table===table).filters.some(([k,v])=>k==='user_id'&&v==='associate-1'));
 assert.ok(p.queries.find(q=>q.table==='callcenter_transcripts').filters.some(([k,v])=>k==='call_activity_id'&&v==='activity-1'));
});
test('plain saved transcripts remain available',async()=>{const p=setup({plain:true});await p.open();assert.match(p.nodes.body.innerHTML,/Saved plain text/)});
test('unavailable or unauthorized calls never fetch another account transcript',async()=>{const p=setup({missingCall:true});await p.open();assert.match(p.nodes.body.innerHTML,/unavailable for this account/);assert.equal(p.queries.length,1)});
test('transcript errors are visible while existing call identifiers remain readable',async()=>{const p=setup({transcriptError:true});await p.open();assert.match(p.nodes.body.innerHTML,/Unable to load the transcript/);assert.match(p.nodes.body.innerHTML,/CAexisting/)});
test('opening another call removes the prior dialog; Escape closes it',async()=>{const p=setup();await p.open();const previous=p.overlay;await p.open();assert.equal(previous.isConnected,false);p.listeners.get('keydown')({key:'Escape'});assert.equal(p.overlay.isConnected,false);assert.equal(p.listeners.has('keydown'),false)});

test('current and previous export buttons select their own saved transcript',async()=>{
 const p=setup();await p.open();
 assert.match(p.nodes.body.innerHTML,/data-previous-export="0"/);
 p.currentExport.handlers.click();assert.equal(p.exports[0].transcript.id,'transcript-1');
 p.previousExport.handlers.click();assert.equal(p.exports[1].transcript,p.oldTranscript);
 assert.equal(p.exports[1].lead,'Existing business');
});
