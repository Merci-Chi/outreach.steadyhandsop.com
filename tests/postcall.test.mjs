import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const controller=await readFile(new URL('../call-voice-controller.js',import.meta.url),'utf8');
const source=await readFile(new URL('../outreach-postcall.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const storageKey='steadyhands:outreach-feedback-drafts-v3';
const finished=extra=>({crm_id:'lead',called:true,attempt_id:'attempt-1',finished_at:Date.now(),...extra});
function page({storageBlocked=false,activity={id:'activity'},writeError=null,storage=new Map(),showRecovery=false}={}){
 const nodes=new Map(),events={},saved=[],rpcs=[],filters=[];let uuid=0;
 const values={outcome:'good',notes:'',interest:[]};
 const node=()=>({textContent:'',isConnected:true,querySelector:s=>nodes.get(s),querySelectorAll:()=>[],remove(){nodes.delete('#'+this.id);this.isConnected=false},className:''});
 for(const id of ['#shFeedbackLater','#shFeedbackForm','#shFeedbackSave','#shFeedbackStatus','#shFeedbackContinue','#shFeedbackOverview','#shFeedbackCompleteError'])nodes.set(id,node());
 const append=n=>nodes.set('#'+n.id,n);
 if(showRecovery)nodes.set('main.content',{prepend:append});
 const document={readyState:'complete',querySelector:s=>nodes.get(s),createElement:()=>node(),head:{append},body:{append}};
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},rpc:async(...args)=>{rpcs.push(args);return {data:'activity',error:null}},from(table){const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:activity}),upsert:async data=>{saved.push({table,data});return {error:writeError}}};return q}};
 const window={steadyHandsCRMClient:client,steadyHandsCallLead:{id:'original',company:'Original'},addEventListener:(k,fn)=>(events[k]??=[]).push(fn),dispatchEvent(event){for(const fn of events[event.type]||[])fn(event)}};
 const emit=(type,detail)=>{for(const fn of events[type]||[])fn({type,detail})};
 vm.runInNewContext(source,{document,window,console:{warn(){},error(){}},crypto:{randomUUID:()=> 'event-'+(++uuid)},Date,sessionStorage:{getItem:k=>storage.get(k),setItem(k,v){if(storageBlocked)throw Error('storage blocked');storage.set(k,v)},removeItem:k=>storage.delete(k)},FormData:class{get(k){return values[k]??''}getAll(k){return values[k]||[]}has(k){return values[k]===true}},setTimeout:fn=>fn()});
 vm.runInNewContext(controller,{document:{getElementById:()=>null},window,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}},Date});
 return {window,nodes,saved,rpcs,filters,storage,values,event:emit,emit:detail=>emit('steadyhands:voice-state',detail),async submit(){await nodes.get('#shFeedbackForm').onsubmit({preventDefault(){},currentTarget:{}})}};
}
test('outbound hangup opens one questionnaire for the original lead even after selection changes',()=>{
 const p=page();p.emit({state:'calling'});p.emit({state:'connected',callSid:'CAoriginal'});
 p.window.steadyHandsCallLead={id:'other',company:'Other'};
 p.emit({state:'ended',reason:'disconnect'});
 assert.match(p.nodes.get('#shFeedbackOverlay').innerHTML,/Original · Outreach Call/);
 const overlay=p.nodes.get('#shFeedbackOverlay');p.emit({state:'ended',reason:'disconnect'});assert.equal(p.nodes.get('#shFeedbackOverlay'),overlay);
});
test('failed authorization does not open a post-call form',()=>{const p=page();p.emit({state:'error'});p.emit({state:'ended',reason:'error'});assert(!p.nodes.has('#shFeedbackOverlay'))});
test('blocked session storage cannot prevent the regular-phone questionnaire opening or saving',async()=>{
 const p=page({storageBlocked:true});assert.equal(p.window.steadyHandsOpenPostCallQuestionnaire(finished()),true);await p.submit();assert.equal(p.rpcs[0][0],'record_regular_outreach_call_v1');assert.match(p.nodes.get('#shFeedbackOverlay').innerHTML,/Call result saved/);p.nodes.get('#shFeedbackContinue').onclick();assert(!p.nodes.has('#shFeedbackOverlay'));
});
test('browser answers attach to the existing owned call without creating manual call activity',async()=>{
 const p=page();p.emit({state:'calling'});p.emit({state:'connected',callSid:'CAoriginal'});p.emit({state:'ended',reason:'disconnect'});await p.submit();
 assert.equal(p.rpcs.length,0);assert.equal(p.saved[0].table,'callcenter_post_call_questionnaires');assert.equal(p.saved[0].data.call_activity_id,'activity');assert.equal(p.saved[0].data.call_method,'outreach');
 for(const [key,value] of [['call_sid','CAoriginal'],['crm_id','original'],['user_id','agent']])assert(p.filters.some(([k,v])=>k===key&&v===value));
});
test('a delayed webhook or denied save retains the questionnaire for retry',async()=>{
 for(const options of [{activity:null},{writeError:{message:'denied'}}]){
  const p=page(options);p.window.steadyHandsOpenPostCallQuestionnaire(finished({call_method:'outreach',call_sid:'CA1'}));await p.submit();
  assert(p.nodes.has('#shFeedbackOverlay'));assert.match(p.nodes.get('#shFeedbackStatus').textContent,/Not saved/);assert.equal(p.nodes.get('#shFeedbackSave').disabled,false);
 }
});
test('the call screen loads the questionnaire before its call controller',async()=>{
 const html=await readFile(new URL('../call.html',import.meta.url),'utf8');assert(html.indexOf('outreach-postcall.js')>0);assert(html.indexOf('outreach-postcall.js')<html.indexOf('call-voice-controller.js'));
});
test('a browser call without an activity row uses the existing call logger before saving answers',async()=>{
 const p=page({activity:null}),logs=[];
 p.window.callcenterRecordCall=async data=>{logs.push(data);return {id:'new-activity'}};
 p.window.steadyHandsOpenPostCallQuestionnaire(finished({call_method:'outreach',call_sid:'CA1'}));await p.submit();
 assert.equal(logs.length,1);assert.equal(logs[0].callSid,'CA1');assert.equal(logs[0].duration,0);assert.equal(p.saved[0].data.call_activity_id,'new-activity');
});
test('regular Finish Call hides the regular call dialog only after the questionnaire opens',async()=>{
 const reference=await readFile(new URL('../outreach-reference.js',import.meta.url),'utf8');
 const finish=reference.slice(reference.indexOf('function finishRegularCall'),reference.indexOf('function recommendedCallStatus'));
 for(const opens of [true,false]){
  const popup={hidden:false,querySelector:()=>null},calls=[];
  const context=vm.createContext({regularCall:{id:'lead',company:'Business',startedAt:Date.now()},Date,$:()=>popup,tell(){},savePendingRegularCall(){calls.push('clear')},renderRegularCall(){},window:{steadyHandsOpenPostCallQuestionnaire(){calls.push('open');return opens},dispatchEvent(){}},CustomEvent:class{}});
  vm.runInContext(finish+';finishRegularCall(true)',context);
  assert.equal(popup.hidden,opens);assert.equal(vm.runInContext('regularCall===null',context),opens);assert.deepEqual(calls,opens?['open','clear']:['open']);
 }
});

test('a call ending before SID assignment saves a zero-duration attempt and its questionnaire',async()=>{
 const p=page(),logs=[];
 p.window.callcenterRecordCall=async data=>{logs.push(data);return {id:'attempt'}};
 p.emit({state:'calling'});p.emit({state:'dialed'});p.emit({state:'ended',reason:'cancel'});await p.submit();
 assert.equal(logs.length,1);assert.equal(logs[0].callSid,'');assert.equal(logs[0].duration,0);
 assert.equal(p.saved[0].data.call_activity_id,'attempt');assert.equal(p.saved[0].data.call_method,'outreach');assert.equal(p.rpcs.length,0);
 assert.match(p.nodes.get('#shFeedbackOverlay').innerHTML,/Call result saved/);p.nodes.get('#shFeedbackContinue').onclick();assert(!p.nodes.has('#shFeedbackOverlay'));
});
test('retry after questionnaire failure reuses the owned activity instead of logging the call twice',async()=>{
 const p=page({writeError:{message:'temporary failure'}}),logs=[];
 p.window.callcenterRecordCall=async data=>{logs.push(data);return {id:'activity'}};
 p.window.steadyHandsOpenPostCallQuestionnaire(finished({call_method:'outreach'}));
 await p.submit();await p.submit();
 assert.equal(logs.length,1);assert.equal(p.saved.length,2);
 assert(p.filters.some(([k,v])=>k==='id'&&v==='activity'));
 assert(p.filters.some(([k,v])=>k==='user_id'&&v==='agent'));
});
test('terminal Twilio events forward a SID that only becomes available at disconnect',async()=>{
 const voice=await readFile(new URL('../twilio-voice.js',import.meta.url),'utf8');
 const bind=voice.slice(voice.indexOf('function bindCall('),voice.indexOf('async function start('));
 const listeners={},events=[],call={parameters:{},on(name,handler){listeners[name]=handler}};
 vm.runInNewContext('let activeCall=call;'+bind+';bindCall(call)',{call,emit:(state,detail)=>events.push({state,...detail}),console});
 call.parameters.CallSid='CAlate';listeners.disconnect();
 assert.equal(events[0].state,'ended');assert.equal(events[0].callSid,'CAlate');
});

test('page load preserves unfinished answers without reopening a questionnaire',()=>{
 const storage=new Map([['steadyhands:outreach-feedback-pending-v2',JSON.stringify({crm_id:'old',company:'Old prospect',event_id:'old-event',answers:{notes:'Keep these notes'}})]]);
 const p=page({storage,showRecovery:true});
 assert(!p.nodes.has('#shFeedbackOverlay'));assert.match(p.nodes.get('#shFeedbackDrafts').innerHTML,/Resume · Old prospect/);
 assert.equal(JSON.parse(storage.get(storageKey)).drafts[0].answers.notes,'Keep these notes');
 p.window.steadyHandsCallLead={id:'new'};p.event('steadyhands:call-lead-ready');p.emit({state:'preparing'});p.emit({state:'calling'});
 assert(!p.nodes.has('#shFeedbackOverlay'));
});
test('calling and ending before a dial succeeds never opens the questionnaire',()=>{
 const p=page();p.emit({state:'calling',attemptId:'not-dialed'});p.emit({state:'error',attemptId:'not-dialed'});p.emit({state:'ended',reason:'error',attemptId:'not-dialed'});
 assert(!p.nodes.has('#shFeedbackOverlay'));assert.equal(JSON.parse(p.storage.get(storageKey)).drafts.length,0);
});
test('a lead alone or a not-called completion cannot open a questionnaire',()=>{
 const p=page();for(const detail of [{crm_id:'lead'},finished({called:false}),finished({finished_at:undefined}),finished({attempt_id:undefined})])assert.equal(p.window.steadyHandsOpenPostCallQuestionnaire(detail),false);
 assert(!p.nodes.has('#shFeedbackOverlay'));
});
test('each dialed attempt opens only once, even after dismissal or saving',async()=>{
 const p=page(),detail=finished({call_method:'regular'});
 assert.equal(p.window.steadyHandsOpenPostCallQuestionnaire(detail),true);
 p.values.notes='Do not reset my answers';p.nodes.get('#shFeedbackForm').oninput();
 const html=p.nodes.get('#shFeedbackOverlay').innerHTML;
 assert.equal(p.window.steadyHandsOpenPostCallQuestionnaire(detail),true);assert.equal(p.nodes.get('#shFeedbackOverlay').innerHTML,html);
 p.nodes.get('#shFeedbackLater').onclick();assert(!p.nodes.has('#shFeedbackOverlay'));
 assert.equal(p.window.steadyHandsOpenPostCallQuestionnaire(detail),true);assert(!p.nodes.has('#shFeedbackOverlay'));
 const id=JSON.parse(p.storage.get(storageKey)).drafts[0].event_id;
 p.window.steadyHandsResumePostCallQuestionnaire(id);assert.match(p.nodes.get('#shFeedbackOverlay').innerHTML,/Do not reset my answers/);
 await p.submit();assert.equal(JSON.parse(p.storage.get(storageKey)).drafts.length,0);
 assert.match(p.nodes.get('#shFeedbackOverlay').innerHTML,/Call result saved/);
 p.nodes.get('#shFeedbackContinue').onclick();
 p.window.steadyHandsOpenPostCallQuestionnaire(detail);assert(!p.nodes.has('#shFeedbackOverlay'));
});
test('new calls preserve earlier drafts and late previous-call events cannot finish a new call',()=>{
 const p=page();p.emit({state:'calling',attemptId:'one'});p.emit({state:'dialed',attemptId:'one'});p.emit({state:'ended',attemptId:'one',reason:'disconnect'});
 p.values.notes='First call notes';p.nodes.get('#shFeedbackForm').oninput();
 p.emit({state:'preparing'});assert(!p.nodes.has('#shFeedbackOverlay'));
 p.emit({state:'calling',attemptId:'two'});p.emit({state:'dialed',attemptId:'two'});
 p.emit({state:'ended',attemptId:'one',reason:'disconnect'});assert(!p.nodes.has('#shFeedbackOverlay'));
 p.values.notes='';p.emit({state:'ended',attemptId:'two',reason:'disconnect'});
 const data=JSON.parse(p.storage.get(storageKey));assert.equal(data.drafts.length,2);assert.equal(data.drafts[0].answers.notes,'First call notes');
});
test('recovery after reloading is explicit and never opens while a call is active',()=>{
 const p=page();p.window.steadyHandsOpenPostCallQuestionnaire(finished());p.values.notes='Recover after refresh';p.event('pagehide');
 const restored=page({storage:p.storage,showRecovery:true});assert(!restored.nodes.has('#shFeedbackOverlay'));
 const id=JSON.parse(p.storage.get(storageKey)).drafts[0].event_id;
 restored.window.SteadyHandsTwilioVoice={isActive:()=>true};assert.equal(restored.window.steadyHandsResumePostCallQuestionnaire(id),false);
 restored.window.SteadyHandsTwilioVoice.isActive=()=>false;assert.equal(restored.window.steadyHandsResumePostCallQuestionnaire(id),true);
 assert.match(restored.nodes.get('#shFeedbackOverlay').innerHTML,/Recover after refresh/);
});
test('Twilio terminal events are deduplicated and carry their original attempt identity',async()=>{
 const voice=await readFile(new URL('../twilio-voice.js',import.meta.url),'utf8');const bind=voice.slice(voice.indexOf('function bindCall('),voice.indexOf('async function start('));
 const listeners={},events=[],call={parameters:{CallSid:'CA1'},on(name,handler){listeners[name]=handler}};
 vm.runInNewContext('let activeCall=call;'+bind+';bindCall(call,{attemptId:"attempt-one"})',{call,emit:(state,detail)=>events.push({state,...detail}),console});
 listeners.cancel();listeners.disconnect();listeners.reject();listeners.accept();
 assert.equal(events.length,1);assert.equal(events[0].state,'ended');assert.equal(events[0].attemptId,'attempt-one');
});
test('regular Didn’t Call clears the manual tracker without opening a questionnaire',async()=>{
 const reference=await readFile(new URL('../outreach-reference.js',import.meta.url),'utf8');const finish=reference.slice(reference.indexOf('function finishRegularCall'),reference.indexOf('function recommendedCallStatus'));
 let opens=0;const context=vm.createContext({regularCall:{id:'lead',startedAt:Date.now()},Date,$:()=>null,tell(){},savePendingRegularCall(){},renderRegularCall(){},window:{steadyHandsOpenPostCallQuestionnaire(){opens++;},dispatchEvent(){}},CustomEvent:class{}});
 vm.runInContext(finish+';finishRegularCall(false)',context);assert.equal(opens,0);assert.equal(vm.runInContext('regularCall',context),null);
});
