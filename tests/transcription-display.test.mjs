import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../outreach-workflow.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const handlers={},timers=new Map(),queries=[];let timerId=0,row=null,now=Date.now();
 class Clock extends Date{static now(){return now}}
 const node=()=>({children:[],dataset:{},value:'',textContent:'',append(){},before(){},after(){},remove(){},replaceChildren(){},setAttribute(){}});
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const window={steadyHandsCallLead:{id:'lead'},addEventListener:(k,v)=>handlers[k]=v,SteadyHandsCallGuide:{mount(){}},SteadyHandsWorkflowCore:{suggestions:()=>[],transcriptSegments:r=>r.segments,fetchTranscript:async(...args)=>{queries.push(args);return typeof row==='function'?row():row}}};
 vm.runInNewContext(source,{window,Date:Clock,document:{getElementById:get,querySelector:()=>null,createComment:node,createElement:node},matchMedia:()=>({matches:false,addEventListener(){}}),MutationObserver:class{observe(){}},setInterval:fn=>{timers.set(++timerId,fn);return timerId},clearInterval:id=>timers.delete(id)});
 const state=async(active,callSid)=>{handlers['steadyhands:call-state']({detail:{active,callSid}});await tick()};
 const poll=async()=>{for(const fn of timers.values())fn();await tick()};
 const segment=(id,seconds,text)=>({segmentId:id,seconds,text,speaker:'prospect'});
 return {get,handlers,window,queries,timers,state,poll,segment,setRow:r=>row=r,advance:n=>now+=n};
}
test('polling waits for CallSid, stays scoped to that call, deduplicates and orders late segments',async()=>{
 const s=setup();await s.state(true);assert.equal(s.queries.length,0);
 s.setRow({id:'t',segments:[s.segment('second',2,'Second')]});await s.state(true,'CA-current');
 assert.equal(s.queries[0][3],'CA-current');
 s.setRow({id:'t',segments:[s.segment('first',1,'First'),s.segment('second',2,'Second')]});await s.poll();await s.poll();
 const text=s.get('transcriptHistory').value;assert(text.indexOf('First')<text.indexOf('Second'));assert.equal(text.match(/Second/g).length,1);
});
test('post-hangup polling imports late finals; each new call to the same lead clears previous speech',async()=>{
 const s=setup();s.setRow({id:'t',segments:[s.segment('1',1,'Initial')]});await s.state(true,'CA-first');await s.state(false);
 assert.equal(s.timers.size,1);s.setRow({id:'t',segments:[s.segment('1',1,'Initial'),s.segment('2',2,'Late final')],transcription_status:'stopped'});await s.poll();
 assert.match(s.get('transcriptHistory').value,/Late final/);assert.equal(s.timers.size,1);
 s.advance(31000);await s.poll();assert.equal(s.timers.size,0);
 s.setRow(null);await s.state(true,'CA-second');assert.equal(s.get('transcriptHistory').value,'');
});
test('provider errors are visible and polling after hangup has a bounded lifetime',async()=>{
 const s=setup();s.setRow({id:'t',segments:[],transcription_status:'error',transcription_error:'Provider failed'});await s.state(true,'CA-call');
 assert.match(s.get('transcriptFeedback').textContent,/Provider failed/);await s.state(false);s.advance(31000);await s.poll();assert.equal(s.timers.size,0);
});
test('an old in-flight request cannot populate a newly selected prospect',async()=>{
 const s=setup();let resolve;s.setRow(()=>new Promise(r=>resolve=r));await s.state(true,'CA-call');
 s.window.steadyHandsCallLead={id:'next'};s.handlers['steadyhands:call-lead-ready']();resolve({id:'t',segments:[s.segment('1',1,'Old prospect')]});await tick();assert.equal(s.get('transcriptHistory').value,'');
});

test('incoming transcript renders independently of a selected lead and ignores stale call updates',async()=>{
 const s=setup(),show=detail=>s.handlers['steadyhands:inbound-transcript']({detail});
 show({started:true,callSid:'CA-incoming'});show({callSid:'CA-incoming',transcript:{transcript:'You: Hello\nProspect: Hi'}});
 assert.equal(s.get('transcriptHistory').value,'You: Hello\nProspect: Hi');assert.equal(s.queries.length,0);
 await s.state(true,'CA-outgoing');show({callSid:'CA-incoming',transcript:{transcript:'Stale'}});
 assert.doesNotMatch(s.get('transcriptHistory').value,/Stale/);
});
