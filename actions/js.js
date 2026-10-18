/* One-question popup questionnaire. Uses only the assigned-action APIs. */
(() => {
  'use strict';
  const zones=[['America/Los_Angeles','PST/PDT','Pacific'],['America/Chicago','CST/CDT','Central'],['America/New_York','EST/EDT','Eastern']];
  const dates=()=>window.SteadyHandsStartDates;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dialog,body,state,step,returnFocus,busy=false,onComplete;
  const direct=['alreadyoncommission.html','currentlyonhourlywage.html'].includes(location.pathname.split('/').pop());
  const today=()=>dates().todayKey('America/Los_Angeles');
  function referenceDate(){const d=dates().parse(today());d.setUTCDate(d.getUTCDate()+(8-d.getUTCDay())%7);return d;}
  const dateLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(dates().parse(value));
  const offset=(zone,date=referenceDate())=>new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value;
  const zoneName=zone=>zones.find(x=>x[0]===zone)?.[1]||zone.replaceAll('_',' ');
  function zoneOptions(selected,local=false){const list=[...zones];if(local&&!list.some(x=>x[0]===selected))list.push([selected,selected.replaceAll('_',' '),'Your timezone']);return list.map(([id,label,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)} (${offset(id)}) · ${esc(name)}</option>`).join('');}
  function instant(minutes){const w=referenceDate(),base=Date.UTC(w.getUTCFullYear(),w.getUTCMonth(),w.getUTCDate(),0,minutes);let result=new Date(base);for(let i=0;i<3;i++){const match=offset(state.workZone,result).match(/GMT([+-])(\d{2}):(\d{2})/);const delta=match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3])):0;result=new Date(base-delta*60000);}return result;}
  function span(zone){const f=d=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(d);return `${f(instant(state.start))} – ${f(instant(state.start+120))}`;}
  function normalizePhone(value){if(!/^[+()0-9 .-]+$/.test(String(value||'').trim()))return null;let digits=String(value).replace(/\D/g,'');if(digits.length===10)digits='1'+digits;return /^1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(digits)?'+'+digits:null;}
  const phoneLabel=()=>({needs_number:'I need a US number',has_number:'I already have one',google_voice:'I have Google Voice'})[state.phoneSetup];
  function ensureDialog(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.id='action-questionnaire';dialog.className='questionnaire-popup';dialog.setAttribute('aria-labelledby','question-title');
    dialog.innerHTML='<button type="button" class="questionnaire-close" aria-label="Close questionnaire">×</button><div id="question-body" tabindex="-1"></div>';
    document.body.appendChild(dialog);body=dialog.querySelector('#question-body');
    dialog.querySelector('.questionnaire-close').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close();});
  }
  function close(){if(busy)return;dialog?.close();document.body.classList.remove('questionnaire-open');returnFocus?.focus?.();if(step==='done')onComplete?.();if(direct)location.href='action-needed.html';}
  function show(title,content,back,next,label='Continue →'){
    body.innerHTML=`<p class="eyebrow">ACTION NEEDED</p><h1 id="question-title">${title}</h1>${content}<p class="status" role="alert">${esc(state.error||'')}</p><div class="actions">${back?'<button type="button" id="question-back" class="secondary">Back</button>':''}${next?`<button type="button" id="question-next">${label}</button>`:''}</div>`;
    body.querySelector('#question-back')?.addEventListener('click',()=>go(back));
    body.querySelector('#question-next')?.addEventListener('click',next);
    body.focus();
  }
  function go(next){if(busy)return;step=next;state.error='';render();}
  function invalid(message){state.error=message;render();}
  function choices(name,items,value){return `<fieldset class="phone-options"><legend class="phone-legend">Choose one</legend><div class="choices">${items.map(([id,label,help])=>`<label class="choice phone-choice"><input type="radio" name="${name}" value="${id}" ${id===value?'checked':''}><span><strong>${label}</strong>${help?`<small>${help}</small>`:''}</span></label>`).join('')}</div></fieldset>`;}
  function selection(name){return body.querySelector(`input[name="${name}"]:checked`)?.value;}
  function render(){
    if(step==='welcome'){
      show('Welcome to your trial.', '<p>Hello, and thank you for onboarding and training with us. We’d like you to feel fully prepared for your trial.</p><div class="notice"><p>Our trial quota is <strong>2 sales per week</strong>. If you do not meet this quota, you may not be selected to move forward with employment.</p><p>You may alternatively move to <strong>commission + bonus</strong> until you are prepared to meet the minimum weekly quota.</p></div>',null,()=>go('path'));
    }else if(step==='path'){
      show('Which path would you like?',choices('path',[['commission','Commission + bonus'],['hourly','Hourly wage','Minimum quota: 2 sales per week.']],state.path),'welcome',()=>{const value=selection('path');if(!value)return invalid('Choose your preferred path.');state.path=value;go(value==='hourly'?'sure':'agreementReminder');});
    }else if(step==='sure'){
      show('Are you sure?','<p>You’ve selected hourly wages, with a trial quota of <strong>2 sales per week</strong>.</p><div class="actions split"><button type="button" class="secondary" id="hourly-sure">I’m sure.</button><button type="button" id="hourly-review">Review and go back</button></div>',null,null);
      body.querySelector('#hourly-sure').onclick=()=>go('quota');body.querySelector('#hourly-review').onclick=()=>go('path');
    }else if(step==='quota'){
      show('Confirm the trial requirement.','<p>If you cannot meet <strong>2 sales per week</strong>, you may no longer be eligible to continue on the hourly wage path or move forward with employment.</p><label class="check"><input id="quota-ack" type="checkbox" '+(state.quotaAcknowledged?'checked':'')+'><span>I understand the minimum quota and eligibility requirement.</span></label>','path',()=>{if(!body.querySelector('#quota-ack').checked)return invalid('Please acknowledge the trial requirement.');state.quotaAcknowledged=true;go('startDate');},'Proceed →');
    }else if(step==='agreementReminder'){
      show('Contact your administrator.','<p>Please contact your administrator to request an updated <strong>commission + bonus agreement</strong>.</p>','path',()=>go('localZone'),'Proceed →');
    }else if(step==='startDate'){
      show('Confirm your start date.',`<p>Your current scheduled start date is:</p><div class="notice"><strong class="start-date">${dateLabel(state.startDate)}</strong></div><button type="button" class="secondary extend-button" id="extend-start">Need more time? Extend your start date</button>`,'quota',()=>go('localZone'),'Confirm & continue →');
      body.querySelector('#extend-start').onclick=()=>go('weekday');
    }else if(step==='weekday'){
      show('Which weekday works for you?',`<label class="field" for="preferred-day">Preferred day</label><select id="preferred-day">${['Monday','Tuesday','Wednesday','Thursday','Friday'].map((day,i)=>`<option value="${i+1}" ${state.weekday===i+1?'selected':''}>${day}</option>`).join('')}</select>`,'startDate',()=>{state.weekday=Number(body.querySelector('#preferred-day').value);go('newDate');});
    }else if(step==='newDate'){
      const available=dates().options(state.weekday,state.startDate,today());
      show('Choose your new start date.',available.length?`<label class="field" for="new-start-date">Available dates</label><select id="new-start-date">${available.map(value=>`<option value="${value}">${dateLabel(value)}</option>`).join('')}</select><small class="help">Later weekdays through ${dateLabel(dates().limitDate(today()))}. Dates use Pacific time.</small>`:'<p>No later dates are available for this weekday within the next four months. Go back and choose another weekday.</p>','weekday',available.length?saveDate:null,'Confirm new start date');
    }else if(step==='localZone'){
      show('What is your local timezone?',`<label class="field" for="local-zone">Your timezone</label><select id="local-zone">${zoneOptions(state.localZone,true)}</select>` ,state.basis==='commission'?null:state.path==='hourly'?'startDate':'agreementReminder',()=>{state.localZone=body.querySelector('#local-zone').value;go('workZone');});
    }else if(step==='workZone'){
      show('Which work timezone do you prefer?',`<label class="field" for="work-zone">Work timezone</label><select id="work-zone">${zoneOptions(state.workZone)}</select><small class="help">Monday–Friday, 9:00 AM–5:00 PM in your chosen work timezone.</small>`,'localZone',()=>{state.workZone=body.querySelector('#work-zone').value;go('window');});
    }else if(step==='window'){
      show('Choose your two-hour window.',`<div class="schedule"><div class="time-window"><strong id="work-time">${span(state.workZone)}</strong><span class="pill">2 hours</span></div><label for="shift-start">Drag to choose your start time.</label><div class="slider"><div class="rail"><div id="shift-block" class="block"></div></div><input type="range" id="shift-start" min="540" max="900" step="15" value="${state.start}" aria-label="Two-hour shift start"></div><div class="scale"><span>9:00 AM</span><span>5:00 PM</span></div><p class="conversion">In your timezone (${esc(zoneName(state.localZone))})<strong id="local-time" aria-live="polite">${span(state.localZone)}</strong></p></div><small class="help">Conversion for the week of ${dateLabel(referenceDate().toISOString().slice(0,10))}.</small>`,'workZone',()=>go('hours'));
      const update=()=>{body.querySelector('#shift-block').style.setProperty('--shift',`${(state.start-540)/360*300}%`);body.querySelector('#work-time').textContent=span(state.workZone);body.querySelector('#local-time').textContent=span(state.localZone);body.querySelector('#shift-start').setAttribute('aria-valuetext',span(state.workZone));};
      body.querySelector('#shift-start').oninput=event=>{state.start=Number(event.target.value);update();};update();
    }else if(step==='hours'){
      show('How many weekly hours do you prefer?',`<label class="field" for="weekly-hours">Preferred weekly hours</label><input id="weekly-hours" type="number" min="2" max="40" step="1" value="${state.hours}" required><small class="help">Enter your total weekly preference, from 2 to 40 hours.</small>`,'window',()=>{const input=body.querySelector('#weekly-hours');if(!input.reportValidity())return;state.hours=Number(input.value);go('phone');});
    }else if(step==='phone'){
      show('Do you need a US number?',choices('phone',[['needs_number','Yes, I need a US number'],['has_number','No, I already have one'],['google_voice','I have Google Voice']],state.phoneSetup),'hours',()=>{const value=selection('phone');if(!value)return invalid('Choose an option for your US calling number.');state.phoneSetup=value;if(value==='needs_number')submit();else go('phoneNumber');},'Continue →');
    }else if(step==='phoneNumber'){
      show(state.phoneSetup==='google_voice'?'What is your Google Voice number?':'What is your US calling number?',`<label class="field" for="us-number">Phone number</label><input id="us-number" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" value="${esc(state.phoneNumber)}" placeholder="(202) 555-0101"><small class="help">Enter 10 digits, or include +1.</small>`,'phone',()=>{state.phoneNumber=body.querySelector('#us-number').value;if(!normalizePhone(state.phoneNumber))return invalid('Enter a valid 10-digit US number, or include +1.');submit();},'Submit preferences →');
    }else if(step==='done'){
      show('Great, preference completed.',`<p>Your answers have been submitted to your administrator.</p><dl class="summary"><div><dt>Selected path</dt><dd>${state.path==='hourly'?'Hourly wage':'Commission + bonus'}</dd></div>${state.path==='hourly'?`<div><dt>Start date</dt><dd>${dateLabel(state.startDate)}</dd></div>`:''}<div><dt>Preferred window</dt><dd>${span(state.workZone)}<br>${esc(zoneName(state.workZone))}</dd></div><div><dt>Weekly hours</dt><dd>${state.hours}</dd></div><div><dt>US number</dt><dd>${phoneLabel()}${state.phoneSetup==='needs_number'?'':'<br>'+esc(normalizePhone(state.phoneNumber))}</dd></div></dl><p>After each shift, report your time worked, daily updates, and warm leads directly to your administrator. Your official hours form will include timezone conversion.</p>${state.phoneSetup==='needs_number'?'<p>Your administrator will follow up about a US calling number.</p>':''}`,null,close,'Done');
    }
  }
  function lock(value){busy=value;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);}
  async function saveDate(){const next=body.querySelector('#new-start-date').value;lock(true);try{state.startDate=await window.OutreachActions.extend(state.assignmentId,state.startDate,next);lock(false);go('startDate');}catch(error){lock(false);invalid(error.message||'Could not confirm the date change. Reload before trying again.');}}
  async function submit(){
    if(busy)return;
    lock(true);
    try{await window.OutreachActions.submit(state.assignmentId,state);lock(false);go('done');}
    catch(error){lock(false);invalid(error.message||'Could not confirm your submission. Return to Action Needed to check its status.');}
  }
  async function open(options={}){
    if(busy)return;
    const {assignment,associate}=await window.OutreachActions.load();
    if(!assignment||assignment.status!=='assigned')throw new Error('This questionnaire must be assigned to your account and still awaiting a response.');
    ensureDialog();returnFocus=document.activeElement;onComplete=options.onComplete;
    state={assignmentId:assignment.id,basis:associate.current_basis,path:associate.current_basis==='commission'?'commission':'',startDate:associate.start_date,quotaAcknowledged:false,weekday:1,localZone:Intl.DateTimeFormat().resolvedOptions().timeZone||zones[0][0],workZone:zones[0][0],start:540,hours:10,phoneSetup:'',phoneNumber:'',error:''};
    step=state.basis==='commission'?'localZone':'welcome';
    document.body.classList.add('questionnaire-open');if(!dialog.open)dialog.showModal();render();
  }
  window.OutreachQuestionnaire={open,close};
  if(direct)document.addEventListener('DOMContentLoaded',()=>open().catch(error=>{const main=document.getElementById('app');if(main)main.innerHTML=`<h1>Action Needed</h1><p role="alert">${esc(error.message)}</p><a class="button" href="action-needed.html">Back to Action Needed</a>`;}));
})();
