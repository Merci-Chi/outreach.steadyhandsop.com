import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const controller=await readFile(new URL('../call-voice-controller.js',import.meta.url),'utf8');
const source=await readFile(new URL('../outreach-postcall.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function page({storageBlocked=false,activity={id:'activity'},writeError=null}={}){
 const nodes=new Map(),events={},saved=[],rpcs=[],filters=[];
 const node=()=>({textContent:'',isConnected:true,querySelector:s=>nodes.get(s),querySelectorAll:()=>[],remove(){nodes.delete('#shFeedbackOverlay')},className:''});
 for(const id of ['#shFeedbackLater','#shFeedbackForm','#shFeedbackSave','#shFeedbackStatus'])nodes.set(id,node());
 const document={readyState:'complete',querySelector:s=>nodes.get(s),createElement:()=>node(),head:{append(){}},body:{append(n){nodes.set('#'+n.id,n)}}};
 const client={auth:{getUser:async()=>({data:{user:{id:'agent'}}})},rpc:async(...args)=>{rpcs.push(args);return {}},from(table){const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:activity}),upsert:async data=>{saved.push({table,data});return {error:writeError}}};return q}};
 const window={steadyHandsCRMClient:client,steadyHandsCallLead:{id:'original',company:'Original'},addEventListener:(k,fn)=>events[k]=fn,dispatchEvent(){}};
 const storage=new Map();
 vm.runInNewContext(source,{document,window,console:{warn(){},error(){}},crypto:{randomUUID:()=> 'event'},sessionStorage:{getItem:k=>storage.get(k),setItem(k,v){if(storageBlocked)throw Error('storage blocked');storage.set(k,v)},removeItem:k=>storage.delete(k)},FormData:class{get(k){return k==='outcome'?'good':''}getAll(){return []}has(){return false}},setTimeout:fn=>fn()});
 vm.runInNewContext(controller,{document:{getElementById:()=>null},window,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}},Date});
 return {window,nodes,saved,rpcs,filters,emit:detail=>events['steadyhands:voice-state']({detail}),async submit(){await nodes.get('#shFeedbackForm').onsubmit({preventDefault(){},currentTarget:{}})}};
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
 const p=page({storageBlocked:true});assert.equal(p.window.steadyHandsOpenPostCallQuestionnaire({crm_id:'lead'}),true);await p.submit();assert.equal(p.rpcs[0][0],'record_regular_outreach_call_v1');assert(!p.nodes.has('#shFeedbackOverlay'));
});
test('browser answers attach to the existing owned call without creating manual call activity',async()=>{
 const p=page();p.emit({state:'calling'});p.emit({state:'connected',callSid:'CAoriginal'});p.emit({state:'ended',reason:'disconnect'});await p.submit();
 assert.equal(p.rpcs.length,0);assert.equal(p.saved[0].table,'callcenter_post_call_questionnaires');assert.equal(p.saved[0].data.call_activity_id,'activity');assert.equal(p.saved[0].data.call_method,'outreach');
 for(const [key,value] of [['call_sid','CAoriginal'],['crm_id','original'],['user_id','agent']])assert(p.filters.some(([k,v])=>k===key&&v===value));
});
test('a delayed webhook or denied save retains the questionnaire for retry',async()=>{
 for(const options of [{activity:null},{writeError:{message:'denied'}}]){
  const p=page(options);p.window.steadyHandsOpenPostCallQuestionnaire({crm_id:'lead',call_method:'outreach',call_sid:'CA1'});await p.submit();
  assert(p.nodes.has('#shFeedbackOverlay'));assert.match(p.nodes.get('#shFeedbackStatus').textContent,/Not saved/);assert.equal(p.nodes.get('#shFeedbackSave').disabled,false);
 }
});
test('the call screen loads the questionnaire before its call controller',async()=>{
 const html=await readFile(new URL('../call.html',import.meta.url),'utf8');assert(html.indexOf('outreach-postcall.js')>0);assert(html.indexOf('outreach-postcall.js')<html.indexOf('call-voice-controller.js'));
});
test('a browser call without an activity row uses the existing call logger before saving answers',async()=>{
 const p=page({activity:null}),logs=[];
 p.window.callcenterRecordCall=async data=>{logs.push(data);return {id:'new-activity'}};
 p.window.steadyHandsOpenPostCallQuestionnaire({crm_id:'lead',call_method:'outreach',call_sid:'CA1'});await p.submit();
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
