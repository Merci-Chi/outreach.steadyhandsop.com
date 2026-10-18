'use strict';
// Assigned questionnaire. Supabase is the source of truth for assignment and submission.
const app = document.getElementById('app');
const page = location.pathname.split('/').pop();
const basis = page === 'alreadyoncommission.html' ? 'commission' : page === 'currentlyonhourlywage.html' ? 'hourly' : null;
const zones = [
  {id:'America/Los_Angeles',label:'PST/PDT',name:'Pacific'},
  {id:'America/Chicago',label:'CST/CDT',name:'Central'},
  {id:'America/New_York',label:'EST/EDT',name:'Eastern'}
];
const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
const state = {path:basis,localZone:detected || zones[0].id,workZone:zones[0].id,start:540,hours:10,startDate:null,dateLoading:false,dateError:false,extendDate:false,weekday:1,newDate:"",dateSaving:false,dateSaved:false};
let step = 'intro';
let accessReady = false;
state.quotaAcknowledged=false;
state.phoneSetup="";
state.phoneNumber="";
state.submitting=false;
state.submitError='';
// Use the upcoming Monday (today if Monday) to make the conversion DST-aware.
const today = new Date();
const week = new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate(),12));
week.setUTCDate(week.getUTCDate() + (8-week.getUTCDay())%7);
const dateLabel = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(week);
function offset(zone,date=week){return new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value;}
function offsetMinutes(zone,date){const s=offset(zone,date);if(s==='GMT')return 0;const m=s.match(/GMT([+-])(\d{2}):(\d{2})/);return (m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]));}
function instant(minutes){const base=Date.UTC(week.getUTCFullYear(),week.getUTCMonth(),week.getUTCDate(),0,minutes);let result=new Date(base);for(let i=0;i<3;i++)result=new Date(base-offsetMinutes(state.workZone,result)*60000);return result;}
function time(date,zone){return new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(date);}
function span(zone){const a=instant(state.start),b=instant(state.start+120);return `${time(a,zone)} – ${time(b,zone)}`;}
function shortZone(zone){return zones.find(z=>z.id===zone)?.label || zone.replaceAll('_',' ');}
function zoneLabel(z){return `${z.label} (${offset(z.id)}) — ${z.name}`;}
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function options(selected,local=false){const entries=[...zones];if(local&&!zones.some(z=>z.id===state.localZone))entries.push({id:state.localZone,label:state.localZone.replaceAll('_',' '),name:'Your timezone'});return entries.map(z=>`<option value="${escapeHTML(z.id)}" ${selected===z.id?'selected':''}>${escapeHTML(zoneLabel(z))}</option>`).join('');}
function layout(title,body,number){app.innerHTML=`<p class="eyebrow">ACTION NEEDED ${number?`<span class="step">${number}</span>`:''}</p><h1>${title}</h1>${body}`;app.focus();}
function go(next){step=next;render();}
function button(id,text,secondary=false){return `<button type="button" id="${id}" class="${secondary?'secondary':''}">${text}</button>`;}
function click(id,fn){document.getElementById(id)?.addEventListener('click',fn);}
function render(){
 if(!accessReady)return;
 if(!basis){layout('Let’s get you ready.',`<p>Select your current agreement to open your questionnaire.</p><div class="choices"><a class="choice" href="alreadyoncommission.html"><span><strong>Already on commission →</strong><small>Set your timezone and preferred hours.</small></span></a><a class="choice" href="currentlyonhourlywage.html"><span><strong>Currently on an hourly wage →</strong><small>Review your trial path, then set your schedule.</small></span></a></div>`);return;}
 if(step==='intro'){
  if(basis==='commission'){go('schedule');return;}
  layout('Choose your path.',`<p>Hello, and thank you for onboarding and training with us. We’d like you to feel fully prepared for your trial.</p><div class="notice"><h2>Trial notice</h2><p>Our trial quota is <strong>2 sales per week</strong>. If you do not meet this quota, you may not be selected to move forward with employment.</p><p>You may alternatively move to <strong>commission + bonus</strong> until you are prepared to meet the minimum weekly quota.</p></div><fieldset style="border:0;padding:0;margin:0"><legend>How would you like to proceed?</legend><div class="choices"><label class="choice"><input type="radio" name="path" value="commission" ${state.path==='commission'?'checked':''}><span><strong>Commission + bonus</strong><small>Request an updated commission agreement.</small></span></label><label class="choice"><input type="radio" name="path" value="hourly" ${state.path==='hourly'?'checked':''}><span><strong>Hourly wage</strong><small>Minimum quota: 2 sales per week.</small></span></label></div></fieldset><div class="actions">${button('continue','Continue →')}</div>`,'1 of 4');
  app.querySelectorAll('[name=path]').forEach(el=>el.addEventListener('change',()=>state.path=el.value));click('continue',()=>go(state.path==='hourly'?'confirm':'agreement'));
 }else if(step==='confirm'){
  layout('Are you sure?',`<p>You’ve selected the hourly wage path, which requires a minimum of <strong>2 sales per week</strong> during your trial.</p><p>Please review this requirement before continuing.</p><div class="actions split">${button('sure',"I’m sure.",true)}${button('review','Review and go back')}</div>`,'1 of 4');click('sure',()=>go('eligibility'));click('review',()=>go('intro'));
 }else if(step==='eligibility'){
  layout('Your trial requirement.',`<div class="notice"><p>If you are unable to meet the minimum quota of <strong>2 sales per week</strong>, you may no longer be eligible to continue on the hourly wage path or move forward with employment.</p></div><label class="check"><input id="ack" type="checkbox"><span>I understand the minimum weekly quota and the eligibility requirement.</span></label><div class="actions">${button('back','Back',true)}<button id="proceed" disabled>Proceed →</button></div>`,'1 of 4');document.getElementById('ack').onchange=e=>{state.quotaAcknowledged=e.target.checked;document.getElementById('proceed').disabled=!e.target.checked;};click('back',()=>go('intro'));click('proceed',()=>{go('startDate');loadStartDate();});
 }else if(step==='startDate'){
  renderStartDate();
 }else if(step==='agreement'){
  layout('Action needed.',`<p>You’ve selected <strong>commission + bonus</strong>.</p><div class="notice"><p>Please contact your administrator to request an <strong>updated commission agreement</strong>.</p><p>This questionnaire records your preference. It does not update your agreement.</p></div><div class="actions">${button('back','Back',true)}${button('proceed','Proceed →')}</div>`,'1 of 4');click('back',()=>go('intro'));click('proceed',()=>go('schedule'));
 }else if(step==='schedule'){
  layout('Set your preferred hours.',`<p>Monday–Friday, within 9:00 AM–5:00 PM in your selected work timezone. Choose a two-hour window.</p><div class="two-fields"><div><label class="field" for="local-zone">Your local timezone</label><select id="local-zone">${options(state.localZone,true)}</select></div><div><label class="field" for="work-zone">Preferred work timezone</label><select id="work-zone">${options(state.workZone)}</select></div></div><small class="help">GMT offsets and conversions are shown for the week of ${dateLabel}. Daylight saving time is handled automatically.</small><div class="schedule"><div class="time-window"><strong id="work-time"></strong><span class="pill">2-hour window</span></div><label for="start" class="help">Drag the blue window to choose your start time.</label><div class="slider"><div class="rail"><div class="block" id="block"></div></div><input type="range" id="start" min="540" max="900" step="15" value="${state.start}" aria-label="Two-hour shift start time"></div><div class="scale"><span>9:00 AM</span><span>5:00 PM</span></div><p class="conversion">In your local timezone <span id="local-name"></span><strong id="local-time" aria-live="polite"></strong></p></div><label for="hours" class="field">Preferred weekly hours</label><input id="hours" type="number" min="2" max="40" step="1" value="${state.hours}" required><small class="help">Your two-hour window is a scheduling preference. Enter your total preferred hours for the week (2–40).</small><div class="actions">${basis==='hourly'?button('back','Back',true):''}<button id="finish" ${state.submitting?'disabled':''}>Continue →</button></div><p class="status" role="alert">${escapeHTML(state.submitError)}</p>` ,basis==='hourly'?'2 of 4':'1 of 3');
  const update=()=>{document.getElementById('work-time').textContent=span(state.workZone);document.getElementById('local-name').textContent=`(${shortZone(state.localZone)})`;document.getElementById('local-time').textContent=span(state.localZone);document.getElementById('block').style.setProperty('--shift',`${(state.start-540)/360*300}%`);document.getElementById('start').setAttribute('aria-valuetext',`${span(state.workZone)} ${shortZone(state.workZone)}`);};
  document.getElementById('local-zone').onchange=e=>{state.localZone=e.target.value;update();};document.getElementById('work-zone').onchange=e=>{state.workZone=e.target.value;update();};document.getElementById('start').oninput=e=>{state.start=Number(e.target.value);update();};document.getElementById('hours').oninput=e=>state.hours=Number(e.target.value);click('back',()=>go(state.path==='hourly'?'startDate':'agreement'));click('finish',()=>{if(document.getElementById('hours').reportValidity()){state.submitError='';go('phone');}});update();if(state.submitting)app.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
 }else if(step==='phone'){
  renderPhoneSetup();
 }else if(step==='done'){
  layout('Great, preference completed.',`<p>Your preference has been submitted. Your administrator can now review your response.</p><dl class="summary"><div><dt>Selected path</dt><dd>${state.path==='hourly'?'Hourly wage':'Commission + bonus'}</dd></div>${state.path==='hourly'&&state.startDate?`<div><dt>Confirmed start date</dt><dd>${formatStartDate(state.startDate)}</dd></div>`:''}<div><dt>Local timezone</dt><dd>${escapeHTML(shortZone(state.localZone))} (${offset(state.localZone)})</dd></div><div><dt>Preferred window · Mon–Fri</dt><dd>${span(state.workZone)}<br>${shortZone(state.workZone)}</dd></div><div><dt>In your local time</dt><dd>${span(state.localZone)}</dd></div><div><dt>Preferred weekly hours</dt><dd>${state.hours} hours</dd></div><div><dt>US calling number</dt><dd>${escapeHTML(phoneSetupLabel())}${state.phoneSetup!=='needs_number'?'<br>'+escapeHTML(normalizeUSPhone(state.phoneNumber)):''}</dd></div></dl>${basis==='hourly'&&state.path==='commission'?'<div class="notice"><strong>Action needed</strong><p>Contact your administrator for an updated commission agreement.</p></div>':''}<div class="notice"><h2>Before your first shift</h2><p>At the end of each shift, report your total time worked, daily updates, and any warm leads directly to your administrator. An official hours form with an automatic timezone converter will be provided.</p>${state.phoneSetup==='needs_number'?'<p>Your administrator will follow up about setting up a US calling number.</p>':''}</div><div class="actions"><a class="button" href="action-needed.html">Back to Action Needed</a>${button('copy','Copy response')}</div><p id="status" class="status" role="status"></p>` ,basis==='hourly'?'4 of 4':'3 of 3');click('copy',copyResponse);
 }
}
function formatStartDate(value){return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(window.SteadyHandsStartDates.parse(value));}
async function loadStartDate(){
 state.dateLoading=true;state.dateError=false;state.startDate=null;render();
 try{state.startDate=await window.SteadyHandsStartDates.load();}catch{state.dateError=true;}
 finally{state.dateLoading=false;if(step==='startDate')render();}
}
function renderStartDate(){
 const dates=window.SteadyHandsStartDates;
 if(state.dateLoading){layout('Confirm your start date.',`<p role="status">Loading your scheduled start date…</p>`);return;}
 if(state.dateError||!state.startDate){layout('Confirm your start date.',`<p role="alert">We couldn’t load your current start date. Please try again or contact your administrator.</p><div class="actions">${button('back','Back',true)}${button('retry-date','Try again')}</div>`);click('back',()=>go('eligibility'));click('retry-date',loadStartDate);return;}
 const today=dates.todayKey('America/Los_Angeles'), available=dates.options(state.weekday,state.startDate,today);
 if(!available.includes(state.newDate))state.newDate=available[0]||'';
 let month='',dateOptions='';
 for(const value of available){const label=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(dates.parse(value));if(label!==month){if(month)dateOptions+='</optgroup>';dateOptions+=`<optgroup label="${label}">`;month=label;}dateOptions+=`<option value="${value}" ${value===state.newDate?'selected':''}>${formatStartDate(value)}</option>`;}
 if(month)dateOptions+='</optgroup>';
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 layout('Confirm your start date.',`<p>Your current scheduled start date is:</p><div class="notice"><strong class="start-date">${formatStartDate(state.startDate)}</strong></div>${state.dateSaved?'<p role="status">Your new start date has been saved.</p>':''}${state.extendDate?`<label class="field" for="weekday">Preferred day of the week</label><select id="weekday" ${state.dateSaving?'disabled':''}>${days.map((day,i)=>`<option value="${i+1}" ${state.weekday===i+1?'selected':''}>${day}</option>`).join('')}</select><label class="field" for="new-date">Choose your new start date</label>${available.length?`<select id="new-date" ${state.dateSaving?'disabled':''}>${dateOptions}</select>`:'<p role="status">No later dates are available for this weekday within the next four months. Try another weekday or contact your administrator.</p>'}<small class="help">Dates use Pacific time. Showing later weekdays through ${formatStartDate(dates.limitDate(today))}. Your current date stays in place until you confirm the change.</small><div class="actions">${button('cancel-date','Keep current date',true)}<button id="save-date" ${!available.length||state.dateSaving?'disabled':''}>${state.dateSaving?'Saving…':'Confirm new start date'}</button></div>`:`<button type="button" class="secondary extend-button" id="extend-date">Need more time? Extend your start date</button><div class="actions">${button('back','Back',true)}${button('accept-date','Confirm start date & continue →')}</div>`}`);
 if(state.extendDate){
  document.getElementById('weekday').onchange=e=>{state.weekday=Number(e.target.value);state.newDate='';render();};
  if(available.length)document.getElementById('new-date').onchange=e=>state.newDate=e.target.value;
  document.getElementById('cancel-date').disabled=state.dateSaving;
  click('cancel-date',()=>{state.extendDate=false;render();});click('save-date',saveStartDate);
 }else{click('back',()=>go('eligibility'));click('accept-date',()=>go('schedule'));click('extend-date',()=>{state.extendDate=true;state.dateSaved=false;render();});}
}
async function saveStartDate(){
 if(state.dateSaving)return;
 state.dateSaving=true;render();
 try{state.startDate=await window.SteadyHandsStartDates.save(state.startDate,state.newDate,state.localZone);state.dateSaved=true;state.extendDate=false;}
 catch{state.dateError=true;state.startDate=null;state.extendDate=false;}
 finally{state.dateSaving=false;if(step==='startDate')render();}
}
async function copyResponse(){const text=`My scheduling preference\nPath: ${state.path==='hourly'?'Hourly wage (minimum 2 sales per week)':'Commission + bonus'}${state.path==='hourly'&&state.startDate?'\nConfirmed start date: '+formatStartDate(state.startDate):''}\nLocal timezone: ${shortZone(state.localZone)} (${offset(state.localZone)})\nPreferred shift: Monday–Friday, ${span(state.workZone)} ${shortZone(state.workZone)}\nIn my local time: ${span(state.localZone)}\nPreferred weekly hours: ${state.hours}\nUS calling number: ${phoneSetupLabel()}${state.phoneSetup==='needs_number'?'':' — '+normalizeUSPhone(state.phoneNumber)}\nConversions for week of ${dateLabel}.${basis==='hourly'&&state.path==='commission'?'\nAction needed: Please send me an updated commission agreement.':''}`;try{if(!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);document.getElementById('status').textContent='Copied. Send your response directly to your administrator.';}catch{const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.setAttribute('aria-label','Scheduling response — select and copy');area.style.cssText='width:100%;min-height:220px;margin-top:16px;padding:14px';document.getElementById('status').textContent='Select and copy your response below.';app.querySelector('textarea')?.remove();app.append(area);area.focus();area.select();}}
function normalizeUSPhone(value){
 if(!/^[+()0-9 .-]+$/.test(String(value||'').trim()))return null;
 const digits=String(value||'').replace(/\D/g,'');
 const national=digits.length===11&&digits.startsWith('1')?digits.slice(1):digits;
 return /^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(national)?'+1'+national:null;
}
function phoneSetupLabel(){return {needs_number:'I need a US number',has_number:'I already have a US number',google_voice:'I have Google Voice'}[state.phoneSetup]||'';}
function renderPhoneSetup(){
 const needsInput=state.phoneSetup==='has_number'||state.phoneSetup==='google_voice';
 const options=[['needs_number','Yes, I need a US number','Request help setting up a calling number.'],['has_number','No, I already have one','Enter the US number you will use for calls.'],['google_voice','I have Google Voice','Enter your Google Voice number.']];
 layout('Do you need a US number?',`<p>One last step before submitting your preferences.</p><fieldset class="phone-options"><legend class="phone-legend">Choose an option</legend><div class="choices">${options.map(([value,title,help])=>`<label class="choice phone-choice ${state.phoneSetup===value?'is-selected':''}"><input type="radio" name="phone-setup" value="${value}" ${state.phoneSetup===value?'checked':''}><span><strong>${title}</strong><small>${help}</small></span></label>`).join('')}</div></fieldset>${needsInput?`<label class="field" for="us-number">${state.phoneSetup==='google_voice'?'Google Voice number':'Your US calling number'}</label><input id="us-number" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" value="${escapeHTML(state.phoneNumber)}" placeholder="(202) 555-0101" required><small class="help">Enter 10 digits, or include the +1 country code.</small>`:''}<div class="actions">${button('phone-back','Back',true)}<button id="submit-phone" ${state.submitting?'disabled':''}>${state.submitting?'Submitting…':'Submit preferences →'}</button></div><p class="status" id="phone-error" role="alert">${escapeHTML(state.submitError)}</p>`,basis==='hourly'?'3 of 4':'2 of 3');
 app.querySelectorAll('[name="phone-setup"]').forEach(el=>el.addEventListener('change',()=>{
   state.phoneSetup=el.value;state.submitError='';render();
   if(state.phoneSetup!=='needs_number')document.getElementById('us-number')?.focus();
 }));
 const input=document.getElementById('us-number');
 if(input)input.addEventListener('input',event=>{state.phoneNumber=event.target.value;});
 click('phone-back',()=>{state.submitError='';go('schedule')});click('submit-phone',submitPreference);
 if(state.submitting)app.querySelectorAll('input,button').forEach(el=>el.disabled=true);
}
async function submitPreference(){
 if(state.submitting)return;
 if(!['needs_number','has_number','google_voice'].includes(state.phoneSetup)){state.submitError='Choose an option for your US calling number.';go('phone');return;}
 if(state.phoneSetup!=='needs_number'&&!normalizeUSPhone(state.phoneNumber)){state.submitError='Enter a valid 10-digit US number, or include +1.';go('phone');return;}
 state.submitting=true;state.submitError='';render();
 try{
   await window.OutreachActions.submit(window.outreachAssignmentId,state);
   go('done');
 }catch(error){
   state.submitError=error.message || 'Could not confirm your submission. Return to Action Needed to check its status.';
   if(step==='phone')render();
 }finally{
   state.submitting=false;
   if(step==='phone')render();
 }
}
async function initialize(){
 try{
   const {assignment,associate}=await window.OutreachActions.load();
   if(!assignment){layout('No action assigned.',`<p>This questionnaire must be assigned to your account by an administrator.</p><a class="button" href="action-needed.html">Back to Action Needed</a>`);return;}
   if(assignment.status==='completed'){layout('Already completed.',`<p>Your response has already been submitted.</p><a class="button" href="action-needed.html">Back to Action Needed</a>`);return;}
   if(associate.current_basis!==basis){
     const href=associate.current_basis==='hourly'?'currentlyonhourlywage.html':'alreadyoncommission.html';
     layout('Open your assigned questionnaire.',`<p>Your current agreement uses a different questionnaire.</p><a class="button" href="${href}">Open assigned questionnaire →</a>`);return;
   }
   window.outreachAssignmentId=assignment.id;
   accessReady=true;render();
 }catch{
   layout('Action unavailable.',`<p role="alert">We couldn’t verify your assigned action. Please reload or contact your administrator.</p><a class="button" href="action-needed.html">Back to Action Needed</a>`);
 }
}
document.addEventListener('DOMContentLoaded',initialize);
