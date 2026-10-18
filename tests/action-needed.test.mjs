import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function harness(path,loaded,submit=async()=>({})){
  let elements={},html='',listeners={};
  const app={focus(){},append(){},querySelectorAll(){return[]},querySelector(){return null},
    set innerHTML(value){html=value;elements={};for(const m of value.matchAll(/<(?:button|input|select|strong|span|div|p)[^>]*\bid="([^"]+)"[^>]*>/g)){
      const tag=m[0];elements[m[1]]={disabled:/\sdisabled/.test(tag),value:tag.match(/value="([^"]*)"/)?.[1],textContent:'',style:{setProperty(k,v){this[k]=v}},setAttribute(k,v){this[k]=v},addEventListener(_,fn){this.click=fn},reportValidity(){return Number(this.value)>=2&&Number(this.value)<=40;}};
    }},get innerHTML(){return html;}};
  const window={OutreachActions:{load:async()=>loaded,submit,extend:async(_,__,next)=>next}};
  const context=vm.createContext({window,Intl,Date,console,location:{pathname:path},document:{getElementById:id=>id==='app'?app:elements[id],addEventListener(type,fn){listeners[type]=fn;}}});
  vm.runInContext(read('actions/start-dates.js'),context);
  vm.runInContext(read('actions/js.js'),context);
  return {app,window,e:()=>elements,run:code=>vm.runInContext(code,context),init:()=>listeners.DOMContentLoaded()};
}
const assigned=basis=>({assignment:{id:'assignment-1',status:'assigned'},associate:{current_basis:basis,start_date:'2026-11-02'}});
test('unassigned, completed, and wrong-route users cannot enter the questionnaire',async()=>{
 const none=harness('alreadyoncommission.html',{assignment:null});await none.init();assert.match(none.app.innerHTML,/No action assigned/);assert.doesNotMatch(none.app.innerHTML,/id="start"/);
 const done=harness('alreadyoncommission.html',{assignment:{status:'completed'}});await done.init();assert.match(done.app.innerHTML,/Already completed/);
 const wrong=harness('alreadyoncommission.html',assigned('hourly'));await wrong.init();assert.match(wrong.app.innerHTML,/href="currentlyonhourlywage.html"/);assert.doesNotMatch(wrong.app.innerHTML,/id="start"/);
});
test('commission goes directly to scheduling, with endpoint-safe timezone conversion',async()=>{
 const h=harness('alreadyoncommission.html',assigned('commission'));await h.init();assert.match(h.app.innerHTML,/Set your preferred hours/);assert.doesNotMatch(h.app.innerHTML,/Trial notice/);
 h.run("state.localZone='America/New_York';render()");assert.equal(h.e()['local-time'].textContent,'12:00 PM – 2:00 PM');h.e().start.oninput({target:{value:'900'}});assert.equal(h.e()['work-time'].textContent,'3:00 PM – 5:00 PM');assert.equal(h.e()['local-time'].textContent,'6:00 PM – 8:00 PM');
});
test('hourly confirmation preserves button order, quota acknowledgment, and start-date step',async()=>{
 const h=harness('currentlyonhourlywage.html',assigned('hourly'));await h.init();h.e().continue.click();assert(h.app.innerHTML.indexOf('id="sure"')<h.app.innerHTML.indexOf('id="review"'));h.e().sure.click();assert(h.e().proceed.disabled);h.e().ack.onchange({target:{checked:true}});assert.equal(h.run('state.quotaAcknowledged'),true);h.e().proceed.click();await new Promise(resolve=>setImmediate(resolve));assert.match(h.app.innerHTML,/Monday, November 2, 2026/);h.e()['extend-date'].click();assert.match(h.app.innerHTML,/Preferred day of the week/);
});
test('hourly choosing commission skips start-date confirmation and requests an agreement',async()=>{
 const h=harness('currentlyonhourlywage.html',assigned('hourly'));await h.init();h.run("state.path='commission'");h.e().continue.click();assert.match(h.app.innerHTML,/updated commission agreement/);h.e().proceed.click();assert.match(h.app.innerHTML,/Set your preferred hours/);
});
test('submission waits for server success and failures remain on the form',async()=>{
 let finish;const h=harness('alreadyoncommission.html',assigned('commission'),()=>new Promise(resolve=>{finish=resolve}));await h.init();const pending=h.run('submitPreference()');assert.match(h.app.innerHTML,/Submitting/);assert.doesNotMatch(h.app.innerHTML,/Great, preference completed/);finish({});await pending;assert.match(h.app.innerHTML,/Your preference has been submitted/);assert.doesNotMatch(h.app.innerHTML,/id="edit"/);
 const fail=harness('alreadyoncommission.html',assigned('commission'),async()=>{throw Error('Assignment cancelled');});await fail.init();await fail.run('submitPreference()');assert.match(fail.app.innerHTML,/Assignment cancelled/);assert.match(fail.app.innerHTML,/Set your preferred hours/);assert.equal(fail.e().finish.disabled,false);
});
test('weekday choices span four calendar months and handle month ends and leap years',()=>{
 const window={};vm.runInNewContext(read('actions/start-dates.js'),{window,Intl,Date});const d=window.SteadyHandsStartDates;
 assert.equal(d.limitDate('2026-10-31'),'2027-02-28');assert.equal(d.limitDate('2027-10-31'),'2028-02-29');assert.throws(()=>d.parse('2026-02-30'));
 for(let day=1;day<=5;day++){const options=d.options(day,'2026-10-20','2026-10-18');assert(options.length>=16);for(const key of options){assert.equal(d.parse(key).getUTCDay(),day);assert(key>'2026-10-20'&&key<='2027-02-18');}}
 assert.equal(d.options(0,'2026-10-20','2026-10-18').length,0);assert.equal(d.options(6,'2026-10-20','2026-10-18').length,0);
});
test('adapter sends assignment and exact response to RPC; database errors propagate',async()=>{
 let call;const window={steadyHandsCRMClient:{auth:{getUser:async()=>({data:{user:{id:'real-user'}}})},rpc:async(name,args)=>{call={name,args};return {data:{saved:true}};}}};
 vm.runInNewContext(read('action-needed-api.js'),{window});await window.OutreachActions.submit('assigned-id',{path:'hourly',localZone:'America/New_York',workZone:'America/Chicago',start:540,hours:20,quotaAcknowledged:true,startDate:'2026-11-02'});
 assert.equal(call.name,'outreach_action_submit');assert.equal(call.args.p_assignment_id,'assigned-id');assert.equal(call.args.p_confirmed_start_date,'2026-11-02');assert.equal(call.args.p_quota_acknowledged,true);assert(!('user_id' in call.args));
 window.steadyHandsCRMClient.rpc=async()=>({error:{message:'Not assigned'}});await assert.rejects(()=>window.OutreachActions.extend('other','2026-11-02','2026-11-09'),/Not assigned/);
});
