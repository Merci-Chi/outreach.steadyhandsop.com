import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(basis='commission',submit=async()=>({})){let dialog;const listeners={};
 class Node{
  constructor(tag='div',attrs=''){this.tag=tag;this.attrs=attrs;this.flat=[];this.listeners={};this.style={setProperty:(k,v)=>{this.style[k]=v}};this.value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';this.checked=/\bchecked\b/.test(attrs);this.disabled=false;this.id=attrs.match(/\bid="([^"]*)"/)?.[1];this.name=attrs.match(/\bname="([^"]*)"/)?.[1];}
  set innerHTML(html){this.html=html;this.flat=[];for(const m of html.matchAll(/<(button|input|select|div|h1|strong|p)[^>]*>/g)){const node=new Node(m[1],m[0]);if(node.tag==='select'){const body=html.slice(m.index).match(/^[\s\S]*?<\/select>/)?.[0]||'';node.value=(body.match(/<option[^>]*value="([^"]*)"[^>]*selected/)||body.match(/<option[^>]*value="([^"]*)"/))?.[1]||'';}this.flat.push(node);}}
  get innerHTML(){return this.html||'';}setAttribute(k,v){this[k]=v;}addEventListener(k,fn){this.listeners[k]=fn;}focus(){}showModal(){this.open=true;}close(){this.open=false;}
  all(){return this.flat.flatMap(x=>[x,...x.all()]);}
  querySelectorAll(s){return this.all().filter(x=>s.startsWith('#')?x.id===s.slice(1):s.startsWith('.')?x.attrs.includes(s.slice(1)):s.startsWith('input[name=')?x.tag==='input'&&x.name===s.match(/name="([^"]*)"/)[1]&&(!s.includes(':checked')||x.checked):s.split(',').includes(x.tag));}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  click(){if(!this.disabled)return this.onclick?.()||this.listeners.click?.();}reportValidity(){const n=Number(this.value);return n>=2&&n<=40&&Number.isInteger(n);}
 }
 const document={activeElement:new Node(),body:{appendChild(n){dialog=n},classList:{add(){},remove(){}}},createElement:tag=>new Node(tag),addEventListener(k,fn){listeners[k]=fn;}};
 const calls=[];const window={OutreachActions:{load:async()=>({assignment:{id:'assigned-1',status:'assigned'},associate:{current_basis:basis,start_date:'2026-11-02'}}),submit:async(...args)=>{calls.push(args);return submit(...args)},extend:async(_,__,next)=>next}};
 const c=vm.createContext({window,document,Intl,Date,location:{pathname:'/action-needed.html'},console});vm.runInContext(read('actions/start-dates.js'),c);vm.runInContext(read('actions/timezone-picker.js'),c);
 // Mock menu DOM while retaining the actual country/area mappings for integration checks.
 const picker=window.SteadyHandsTimezonePicker;
 picker.mount=(host,selected,onChange,reference,saved)=>{
  const value=saved||picker.locate(picker.catalog(selected),selected);
  onChange({...value,confirmed:true});host.innerHTML='<input type="hidden" id="local-zone" value="'+value.zone+'">';
 };
 vm.runInContext(read('actions/js.js'),c);
 return {window,calls,open:()=>window.OutreachQuestionnaire.open(),get body(){return dialog.querySelector('#question-body')},get dialog(){return dialog},node(id){return this.body.querySelector('#'+id)},next(){return this.node('question-next').click()},choose(name,value){this.body.all().filter(x=>x.name===name).forEach(x=>x.checked=x.value===value)}};
}
async function toPhone(h){h.next();h.next();h.next();assert.match(h.body.innerHTML,/Do you need a US number/);}
test('commission popup asks timezone and shift, then phone, without a weekly-hours question',async()=>{
 const h=harness();await h.open();assert(h.dialog.open);assert.match(h.body.innerHTML,/What is your local timezone/);assert.equal(h.body.querySelectorAll('select').length,0);assert.equal(h.node('local-zone').attrs.includes('type="hidden"'),true);
 h.node('local-zone').value='America/New_York';h.next();assert.match(h.body.innerHTML,/Which work timezone/);h.node('work-zone').value='America/Los_Angeles';h.next();assert.equal(h.body.querySelectorAll('input').length,1);h.node('shift-start').oninput({target:{value:'900'}});assert.equal(h.node('work-time').textContent,'3:00 PM – 5:00 PM');assert.equal(h.node('local-time').textContent,'6:00 PM – 8:00 PM');h.next();assert.match(h.body.innerHTML,/Do you need a US number/);assert.doesNotMatch(h.body.innerHTML,/weekly-hours/);
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
test('unassigned or completed users cannot open the questionnaire dialog',async()=>{
 const h=harness();h.window.OutreachActions.load=async()=>({assignment:null});await assert.rejects(()=>h.open(),/assigned/);assert.equal(h.dialog,undefined);
 h.window.OutreachActions.load=async()=>({assignment:{status:'completed'}});await assert.rejects(()=>h.open(),/assigned/);assert.equal(h.dialog,undefined);
});
test('local timezone selector groups worldwide zones by country and area; work zones stay limited',async()=>{
 const h=harness();await h.open();
 const picker=h.window.SteadyHandsTimezonePicker,countries=picker.catalog('Asia/Kathmandu');
 assert(countries.length>200);
 for(const [zone,code] of [['Africa/Johannesburg','ZA'],['America/Sao_Paulo','BR'],['Asia/Manila','PH'],['Asia/Tokyo','JP'],['Australia/Sydney','AU'],['Europe/London','GB'],['Pacific/Auckland','NZ'],['UTC','ZZ'],['Asia/Katmandu','NP'],['America/Indianapolis','US']])assert.equal(picker.locate(countries,zone).country,code,zone);
 h.next();assert.equal((h.body.innerHTML.match(/data-work-zone=/g)||[]).length,3);
});

test('US number input autoformats typing and paste and limits digits',async()=>{
 const h=harness();await h.open();await toPhone(h);h.choose('phone','has_number');h.next();
 const input=h.node('us-number');
 for(const [typed,expected] of [['2','+1(2'],['2025550101','+1(202)555-0101'],['+1 (202) 555-0101','+1(202)555-0101'],['20255501019999','+1(202)555-0101'],['','']]){input.value=typed;input.oninput();assert.equal(input.value,expected);}
 input.value='2025550101';input.oninput();h.next();await tick();assert.match(h.body.innerHTML,/Great, preference completed/);assert.equal(h.calls[0][1].phoneNumber,'+1(202)555-0101');assert.equal(h.calls[0][1].hours,10);
});

test('timezone country mappings retain separate areas and accept modern and legacy IANA names',async()=>{
 const h=harness();await h.open();const picker=h.window.SteadyHandsTimezonePicker;
 const countries=picker.catalog('UTC');
 const us=countries.find(c=>c.id==='US');
 assert(us.areas.has('California'));assert(us.areas.has('New York'));assert(us.areas.has('Arizona'));assert.equal(us.areas.size,51);
 assert(us.areas.get('New York').zones.some(z=>z.id==='America/New_York'));
 assert(us.areas.get('New York').zones.length<15);
 for(const [zone,code] of [['Asia/Kathmandu','NP'],['Asia/Kolkata','IN'],['Europe/Kyiv','UA'],['America/Indiana/Indianapolis','US']])assert.equal(picker.locate(countries,zone).country,code);
 const extra=picker.catalog('Etc/GMT+5');assert.equal(picker.locate(extra,'Etc/GMT+5').country,'ZZ');
});

test('timezone picker offers every country under a continent and uses readable GMT labels',async()=>{
 const h=harness();await h.open();const picker=h.window.SteadyHandsTimezonePicker;
 const countries=picker.catalog('UTC');assert(countries.every(c=>c.continent));
 for(const [zone,continent] of [['America/Los_Angeles','NA'],['America/Sao_Paulo','SA'],['Europe/London','EU'],['Africa/Johannesburg','AF'],['Asia/Manila','AS'],['Australia/Sydney','OC'],['Antarctica/Casey','AN'],['UTC','ZZ']])assert.equal(picker.locate(countries,zone).continent,continent);
 assert.equal(picker.timezoneLabel('America/Los_Angeles',new Date('2026-10-19T00:00:00Z')),'PST/PDT (GMT-7)');
 assert.match(picker.timezoneLabel('Asia/Kathmandu',new Date('2026-10-19T00:00:00Z')),/GMT\+5:45/);
 assert.match(picker.timezoneLabel('America/Los_Angeles',new Date('2026-01-19T00:00:00Z')),/GMT-8/);
});
