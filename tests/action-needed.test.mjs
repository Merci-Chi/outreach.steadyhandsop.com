import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(basis='commission',submit=async()=>({})){let dialog;const listeners={};
 class Node{
  constructor(tag='div',attrs=''){this.tag=tag;this.attrs=attrs;this.flat=[];this.listeners={};this.style={setProperty:(k,v)=>{this.style[k]=v}};this.value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';this.checked=/\bchecked\b/.test(attrs);this.disabled=false;this.id=attrs.match(/\bid="([^"]*)"/)?.[1];this.name=attrs.match(/\bname="([^"]*)"/)?.[1];}
  set innerHTML(html){this.html=html;this.flat=[];for(const m of html.matchAll(/<(button|input|select|div|h1|strong)[^>]*>/g)){const node=new Node(m[1],m[0]);if(node.tag==='select'){const body=html.slice(m.index).match(/^[\s\S]*?<\/select>/)?.[0]||'';node.value=(body.match(/<option[^>]*value="([^"]*)"[^>]*selected/)||body.match(/<option[^>]*value="([^"]*)"/))?.[1]||'';}this.flat.push(node);}}
  get innerHTML(){return this.html||'';}setAttribute(k,v){this[k]=v;}addEventListener(k,fn){this.listeners[k]=fn;}focus(){}showModal(){this.open=true;}close(){this.open=false;}
  all(){return this.flat.flatMap(x=>[x,...x.all()]);}
  querySelectorAll(s){return this.all().filter(x=>s.startsWith('#')?x.id===s.slice(1):s.startsWith('.')?x.attrs.includes(s.slice(1)):s.startsWith('input[name=')?x.tag==='input'&&x.name===s.match(/name="([^"]*)"/)[1]&&(!s.includes(':checked')||x.checked):s.split(',').includes(x.tag));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  click(){if(!this.disabled)return this.onclick?.()||this.listeners.click?.();}reportValidity(){const n=Number(this.value);return n>=2&&n<=40&&Number.isInteger(n);}
 }
 const document={activeElement:new Node(),body:{appendChild(n){dialog=n},classList:{add(){},remove(){}}},createElement:tag=>new Node(tag),addEventListener(k,fn){listeners[k]=fn;}};
 const calls=[];const window={OutreachActions:{load:async()=>({assignment:{id:'assigned-1',status:'assigned'},associate:{current_basis:basis,start_date:'2026-11-02'}}),submit:async(...args)=>{calls.push(args);return submit(...args)},extend:async(_,__,next)=>next}};
 const c=vm.createContext({window,document,Intl,Date,location:{pathname:'/action-needed.html'},console});vm.runInContext(read('actions/start-dates.js'),c);vm.runInContext(read('actions/js.js'),c);
 return {window,calls,open:()=>window.OutreachQuestionnaire.open(),get body(){return dialog.querySelector('#question-body')},get dialog(){return dialog},node(id){return this.body.querySelector('#'+id)},next(){return this.node('question-next').click()},choose(name,value){this.body.all().filter(x=>x.name===name).forEach(x=>x.checked=x.value===value)}};
}
async function toPhone(h){h.next();h.next();h.next();h.next();assert.match(h.body.innerHTML,/Do you need a US number/);}
test('commission popup asks timezone, work timezone, shift and weekly hours separately',async()=>{
 const h=harness();await h.open();assert(h.dialog.open);assert.match(h.body.innerHTML,/What is your local timezone/);assert.equal(h.body.querySelectorAll('select').length,1);assert.equal(h.body.querySelectorAll('input').length,0);
 h.node('local-zone').value='America/New_York';h.next();assert.match(h.body.innerHTML,/Which work timezone/);h.node('work-zone').value='America/Los_Angeles';h.next();assert.equal(h.body.querySelectorAll('input').length,1);h.node('shift-start').oninput({target:{value:'900'}});assert.equal(h.node('work-time').textContent,'3:00 PM – 5:00 PM');assert.equal(h.node('local-time').textContent,'6:00 PM – 8:00 PM');h.next();assert.match(h.body.innerHTML,/weekly hours/);assert.equal(h.body.querySelectorAll('input').length,1);
});
test('hourly path keeps confirmation order, quota and separate weekday/date popups',async()=>{
 const h=harness('hourly');await h.open();h.next();h.choose('path','hourly');h.next();assert(h.body.innerHTML.indexOf('id="hourly-sure"')<h.body.innerHTML.indexOf('id="hourly-review"'));h.node('hourly-sure').click();h.next();assert.match(h.body.innerHTML,/Please acknowledge/);h.node('quota-ack').checked=true;h.next();assert.match(h.body.innerHTML,/Confirm your start date/);h.node('extend-start').click();assert.equal(h.body.querySelectorAll('select').length,1);h.next();assert.equal(h.body.querySelectorAll('select').length,1);assert.match(h.body.innerHTML,/Choose your new start date/);await h.next();assert.match(h.body.innerHTML,/Confirm your start date/);
});
test('commission selection shows only an administrator reminder and never an agreement link',async()=>{
 const h=harness('hourly');await h.open();h.next();h.choose('path','commission');h.next();assert.match(h.body.innerHTML,/Contact your administrator/);assert.doesNotMatch(h.body.innerHTML,/href=|signature|PDF/);h.next();assert.match(h.body.innerHTML,/local timezone/);
});
test('US number choice and Google Voice number use separate popups with validation',async()=>{
 const h=harness();await h.open();await toPhone(h);h.next();assert.match(h.body.innerHTML,/Choose an option/);h.choose('phone','google_voice');h.next();assert.match(h.body.innerHTML,/Google Voice number/);assert.equal(h.body.querySelectorAll('input').length,1);h.node('us-number').value='bad';h.next();assert.match(h.body.innerHTML,/valid 10-digit/);assert.equal(h.calls.length,0);h.node('us-number').value='(202) 555-0101';h.next();await tick();assert.match(h.body.innerHTML,/Great, preference completed/);assert.equal(h.calls[0][1].phoneSetup,'google_voice');assert.doesNotMatch(h.body.innerHTML,/href=|onboard\.steadyhandsop/);
});
test('submission waits for Supabase and failure stays in the popup',async()=>{
 let resolve;const h=harness('commission',()=>new Promise(r=>{resolve=r}));await h.open();await toPhone(h);h.choose('phone','needs_number');h.next();assert.doesNotMatch(h.body.innerHTML,/Great, preference completed/);resolve({});await tick();assert.match(h.body.innerHTML,/Great, preference completed/);
 const fail=harness('commission',async()=>{throw Error('Assignment cancelled')});await fail.open();await toPhone(fail);fail.choose('phone','needs_number');fail.next();await tick();assert.match(fail.body.innerHTML,/Assignment cancelled/);assert.match(fail.body.innerHTML,/Do you need a US number/);
});
test('date options use four calendar months and exclude weekends and earlier dates',()=>{
 const window={};vm.runInNewContext(read('actions/start-dates.js'),{window,Intl,Date});const d=window.SteadyHandsStartDates;assert.equal(d.limitDate('2026-10-31'),'2027-02-28');assert.equal(d.limitDate('2027-10-31'),'2028-02-29');for(let day=1;day<=5;day++)for(const key of d.options(day,'2026-10-20','2026-10-18')){assert.equal(d.parse(key).getUTCDay(),day);assert(key>'2026-10-20'&&key<='2027-02-18');}
});
test('questionnaire pages bypass the legacy agreement redirect, while lead pages remain paused',async()=>{
 async function guard(path,assigned){const events={};let redirected=null,removed=false,checks=0;const q={select(){return this},eq(){return this},maybeSingle:async()=>({data:assigned?{id:'assigned-1'}:null})};const client={auth:{getSession:async()=>({data:{session:{user:{id:'user',created_at:'2020-01-01'}}}})},rpc:async()=>{checks++;return{data:{is_paused:true}}},from:()=>q};const document={documentElement:{classList:{add(){},remove(){removed=true}}},addEventListener(k,fn){events[k]=fn}};const window={supabase:{createClient:()=>client}};vm.runInNewContext(read('auth-guard.js'),{window,document,location:{pathname:path,replace(v){redirected=v}},console});await events.DOMContentLoaded();return{redirected,removed,checks};}
 const own=await guard('/action-needed.html',true);assert.equal(own.redirected,null);assert(own.removed);assert.equal(own.checks,0);
 assert.equal((await guard('/index.html',true)).redirected,'action-needed.html?open=1');assert.equal((await guard('/leads.html',false)).redirected,'pause.html');
});
test('unassigned or completed users cannot open the questionnaire dialog',async()=>{
 const h=harness();h.window.OutreachActions.load=async()=>({assignment:null});await assert.rejects(()=>h.open(),/assigned/);assert.equal(h.dialog,undefined);
 h.window.OutreachActions.load=async()=>({assignment:{status:'completed'}});await assert.rejects(()=>h.open(),/assigned/);assert.equal(h.dialog,undefined);
});
test('local timezone dropdown includes worldwide regions, UTC and fractional offsets; work zones stay limited',async()=>{
 const h=harness();await h.open();
 const html=h.body.innerHTML;
 assert((html.match(/<option /g)||[]).length>400);
 for(const zone of ['Africa/Johannesburg','America/Sao_Paulo','Asia/Manila','Asia/Tokyo','Australia/Sydney','Europe/London','Pacific/Auckland','UTC'])assert(html.includes('value="'+zone+'"'),zone);
 assert.match(html,/GMT\+05:45/);assert.match(html,/GMT\+05:30/);assert.match(html,/GMT\+00:00/);
 h.next();assert.equal((h.body.innerHTML.match(/<option /g)||[]).length,3);
});
