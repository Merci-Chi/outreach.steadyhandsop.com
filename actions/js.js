/* One-question popup questionnaire. Uses only the assigned-action APIs. */
(() => {
  'use strict';
  const zones=[['America/Los_Angeles','PST/PDT','Pacific'],['America/Chicago','CST/CDT','Central'],['America/New_York','EST/EDT','Eastern']];
  // Complete fallback for browsers without Intl.supportedValuesOf.
  const fallbackTimeZones=["Africa/Abidjan","Africa/Accra","Africa/Addis_Ababa","Africa/Algiers","Africa/Asmera","Africa/Bamako","Africa/Bangui","Africa/Banjul","Africa/Bissau","Africa/Blantyre","Africa/Brazzaville","Africa/Bujumbura","Africa/Cairo","Africa/Casablanca","Africa/Ceuta","Africa/Conakry","Africa/Dakar","Africa/Dar_es_Salaam","Africa/Djibouti","Africa/Douala","Africa/El_Aaiun","Africa/Freetown","Africa/Gaborone","Africa/Harare","Africa/Johannesburg","Africa/Juba","Africa/Kampala","Africa/Khartoum","Africa/Kigali","Africa/Kinshasa","Africa/Lagos","Africa/Libreville","Africa/Lome","Africa/Luanda","Africa/Lubumbashi","Africa/Lusaka","Africa/Malabo","Africa/Maputo","Africa/Maseru","Africa/Mbabane","Africa/Mogadishu","Africa/Monrovia","Africa/Nairobi","Africa/Ndjamena","Africa/Niamey","Africa/Nouakchott","Africa/Ouagadougou","Africa/Porto-Novo","Africa/Sao_Tome","Africa/Tripoli","Africa/Tunis","Africa/Windhoek","America/Adak","America/Anchorage","America/Anguilla","America/Antigua","America/Araguaina","America/Argentina/La_Rioja","America/Argentina/Rio_Gallegos","America/Argentina/Salta","America/Argentina/San_Juan","America/Argentina/San_Luis","America/Argentina/Tucuman","America/Argentina/Ushuaia","America/Aruba","America/Asuncion","America/Bahia","America/Bahia_Banderas","America/Barbados","America/Belem","America/Belize","America/Blanc-Sablon","America/Boa_Vista","America/Bogota","America/Boise","America/Buenos_Aires","America/Cambridge_Bay","America/Campo_Grande","America/Cancun","America/Caracas","America/Catamarca","America/Cayenne","America/Cayman","America/Chicago","America/Chihuahua","America/Ciudad_Juarez","America/Coral_Harbour","America/Cordoba","America/Costa_Rica","America/Coyhaique","America/Creston","America/Cuiaba","America/Curacao","America/Danmarkshavn","America/Dawson","America/Dawson_Creek","America/Denver","America/Detroit","America/Dominica","America/Edmonton","America/Eirunepe","America/El_Salvador","America/Fort_Nelson","America/Fortaleza","America/Glace_Bay","America/Godthab","America/Goose_Bay","America/Grand_Turk","America/Grenada","America/Guadeloupe","America/Guatemala","America/Guayaquil","America/Guyana","America/Halifax","America/Havana","America/Hermosillo","America/Indiana/Knox","America/Indiana/Marengo","America/Indiana/Petersburg","America/Indiana/Tell_City","America/Indiana/Vevay","America/Indiana/Vincennes","America/Indiana/Winamac","America/Indianapolis","America/Inuvik","America/Iqaluit","America/Jamaica","America/Jujuy","America/Juneau","America/Kentucky/Monticello","America/Kralendijk","America/La_Paz","America/Lima","America/Los_Angeles","America/Louisville","America/Lower_Princes","America/Maceio","America/Managua","America/Manaus","America/Marigot","America/Martinique","America/Matamoros","America/Mazatlan","America/Mendoza","America/Menominee","America/Merida","America/Metlakatla","America/Mexico_City","America/Miquelon","America/Moncton","America/Monterrey","America/Montevideo","America/Montserrat","America/Nassau","America/New_York","America/Nome","America/Noronha","America/North_Dakota/Beulah","America/North_Dakota/Center","America/North_Dakota/New_Salem","America/Ojinaga","America/Panama","America/Paramaribo","America/Phoenix","America/Port-au-Prince","America/Port_of_Spain","America/Porto_Velho","America/Puerto_Rico","America/Punta_Arenas","America/Rankin_Inlet","America/Recife","America/Regina","America/Resolute","America/Rio_Branco","America/Santarem","America/Santiago","America/Santo_Domingo","America/Sao_Paulo","America/Scoresbysund","America/Sitka","America/St_Barthelemy","America/St_Johns","America/St_Kitts","America/St_Lucia","America/St_Thomas","America/St_Vincent","America/Swift_Current","America/Tegucigalpa","America/Thule","America/Tijuana","America/Toronto","America/Tortola","America/Vancouver","America/Whitehorse","America/Winnipeg","America/Yakutat","Antarctica/Casey","Antarctica/Davis","Antarctica/DumontDUrville","Antarctica/Macquarie","Antarctica/Mawson","Antarctica/McMurdo","Antarctica/Palmer","Antarctica/Rothera","Antarctica/Syowa","Antarctica/Troll","Antarctica/Vostok","Arctic/Longyearbyen","Asia/Aden","Asia/Almaty","Asia/Amman","Asia/Anadyr","Asia/Aqtau","Asia/Aqtobe","Asia/Ashgabat","Asia/Atyrau","Asia/Baghdad","Asia/Bahrain","Asia/Baku","Asia/Bangkok","Asia/Barnaul","Asia/Beirut","Asia/Bishkek","Asia/Brunei","Asia/Calcutta","Asia/Chita","Asia/Colombo","Asia/Damascus","Asia/Dhaka","Asia/Dili","Asia/Dubai","Asia/Dushanbe","Asia/Famagusta","Asia/Gaza","Asia/Hebron","Asia/Hong_Kong","Asia/Hovd","Asia/Irkutsk","Asia/Jakarta","Asia/Jayapura","Asia/Jerusalem","Asia/Kabul","Asia/Kamchatka","Asia/Karachi","Asia/Katmandu","Asia/Khandyga","Asia/Krasnoyarsk","Asia/Kuala_Lumpur","Asia/Kuching","Asia/Kuwait","Asia/Macau","Asia/Magadan","Asia/Makassar","Asia/Manila","Asia/Muscat","Asia/Nicosia","Asia/Novokuznetsk","Asia/Novosibirsk","Asia/Omsk","Asia/Oral","Asia/Phnom_Penh","Asia/Pontianak","Asia/Pyongyang","Asia/Qatar","Asia/Qostanay","Asia/Qyzylorda","Asia/Rangoon","Asia/Riyadh","Asia/Saigon","Asia/Sakhalin","Asia/Samarkand","Asia/Seoul","Asia/Shanghai","Asia/Singapore","Asia/Srednekolymsk","Asia/Taipei","Asia/Tashkent","Asia/Tbilisi","Asia/Tehran","Asia/Thimphu","Asia/Tokyo","Asia/Tomsk","Asia/Ulaanbaatar","Asia/Urumqi","Asia/Ust-Nera","Asia/Vientiane","Asia/Vladivostok","Asia/Yakutsk","Asia/Yekaterinburg","Asia/Yerevan","Atlantic/Azores","Atlantic/Bermuda","Atlantic/Canary","Atlantic/Cape_Verde","Atlantic/Faeroe","Atlantic/Madeira","Atlantic/Reykjavik","Atlantic/South_Georgia","Atlantic/St_Helena","Atlantic/Stanley","Australia/Adelaide","Australia/Brisbane","Australia/Broken_Hill","Australia/Darwin","Australia/Eucla","Australia/Hobart","Australia/Lindeman","Australia/Lord_Howe","Australia/Melbourne","Australia/Perth","Australia/Sydney","Europe/Amsterdam","Europe/Andorra","Europe/Astrakhan","Europe/Athens","Europe/Belgrade","Europe/Berlin","Europe/Bratislava","Europe/Brussels","Europe/Bucharest","Europe/Budapest","Europe/Busingen","Europe/Chisinau","Europe/Copenhagen","Europe/Dublin","Europe/Gibraltar","Europe/Guernsey","Europe/Helsinki","Europe/Isle_of_Man","Europe/Istanbul","Europe/Jersey","Europe/Kaliningrad","Europe/Kiev","Europe/Kirov","Europe/Lisbon","Europe/Ljubljana","Europe/London","Europe/Luxembourg","Europe/Madrid","Europe/Malta","Europe/Mariehamn","Europe/Minsk","Europe/Monaco","Europe/Moscow","Europe/Oslo","Europe/Paris","Europe/Podgorica","Europe/Prague","Europe/Riga","Europe/Rome","Europe/Samara","Europe/San_Marino","Europe/Sarajevo","Europe/Saratov","Europe/Simferopol","Europe/Skopje","Europe/Sofia","Europe/Stockholm","Europe/Tallinn","Europe/Tirane","Europe/Ulyanovsk","Europe/Vaduz","Europe/Vatican","Europe/Vienna","Europe/Vilnius","Europe/Volgograd","Europe/Warsaw","Europe/Zagreb","Europe/Zurich","Indian/Antananarivo","Indian/Chagos","Indian/Christmas","Indian/Cocos","Indian/Comoro","Indian/Kerguelen","Indian/Mahe","Indian/Maldives","Indian/Mauritius","Indian/Mayotte","Indian/Reunion","Pacific/Apia","Pacific/Auckland","Pacific/Bougainville","Pacific/Chatham","Pacific/Easter","Pacific/Efate","Pacific/Enderbury","Pacific/Fakaofo","Pacific/Fiji","Pacific/Funafuti","Pacific/Galapagos","Pacific/Gambier","Pacific/Guadalcanal","Pacific/Guam","Pacific/Honolulu","Pacific/Kiritimati","Pacific/Kosrae","Pacific/Kwajalein","Pacific/Majuro","Pacific/Marquesas","Pacific/Midway","Pacific/Nauru","Pacific/Niue","Pacific/Norfolk","Pacific/Noumea","Pacific/Pago_Pago","Pacific/Palau","Pacific/Pitcairn","Pacific/Ponape","Pacific/Port_Moresby","Pacific/Rarotonga","Pacific/Saipan","Pacific/Tahiti","Pacific/Tarawa","Pacific/Tongatapu","Pacific/Truk","Pacific/Wake","Pacific/Wallis"];
  const dates=()=>window.SteadyHandsStartDates;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dialog,body,state,step,returnFocus,busy=false,onComplete;
  const direct=['alreadyoncommission.html','currentlyonhourlywage.html'].includes(location.pathname.split('/').pop());
  const today=()=>dates().todayKey('America/Los_Angeles');
  function referenceDate(){const d=dates().parse(today());d.setUTCDate(d.getUTCDate()+(8-d.getUTCDay())%7);return d;}
  const dateLabel=value=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(dates().parse(value));
  const offset=(zone,date=referenceDate())=>new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value;
  const zoneName=zone=>zones.find(x=>x[0]===zone)?.[1]||zone.replaceAll('_',' ');
  function zoneOptions(selected,local=false){
    if(!local)return zones.map(([id,label,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)} (${offset(id)}) · ${esc(name)}</option>`).join('');
    let supported;
    try{supported=Intl.supportedValuesOf('timeZone');}catch{supported=fallbackTimeZones;}
    const reference=referenceDate();
    return [...new Set([...supported,'UTC',selected])].filter(id=>{
      try{new Intl.DateTimeFormat('en-US',{timeZone:id}).format(reference);return true;}catch{return false;}
    }).sort((a,b)=>a.localeCompare(b)).map(id=>{
      const gmt=offset(id,reference);
      const label=id.replaceAll('_',' ').replaceAll('/',' / ');
      return `<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)} (${gmt==='GMT'?'GMT+00:00':gmt})</option>`;
    }).join('');
  }

  function instant(minutes){const w=referenceDate(),base=Date.UTC(w.getUTCFullYear(),w.getUTCMonth(),w.getUTCDate(),0,minutes);let result=new Date(base);for(let i=0;i<3;i++){const match=offset(state.workZone,result).match(/GMT([+-])(\d{2}):(\d{2})/);const delta=match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3])):0;result=new Date(base-delta*60000);}return result;}
  function span(zone){const f=d=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(d);return `${f(instant(state.start))} – ${f(instant(state.start+120))}`;}
  function normalizePhone(value){if(!/^[+()0-9 .-]+$/.test(String(value||'').trim()))return null;let digits=String(value).replace(/\D/g,'');if(digits.length===10)digits='1'+digits;return /^1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(digits)?'+'+digits:null;}
  function formatPhone(value){
    let digits=String(value||'').replace(/\D/g,'');
    if(digits.startsWith('1'))digits=digits.slice(1);
    digits=digits.slice(0,10);
    if(!digits)return '';
    return '+1('+digits.slice(0,3)+(digits.length>=3?')':'')+digits.slice(3,6)+(digits.length>6?'-'+digits.slice(6):'');
  }
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
      show('Choose your two-hour window.',`<div class="schedule"><div class="time-window"><strong id="work-time">${span(state.workZone)}</strong><span class="pill">2 hours</span></div><label for="shift-start">Drag to choose your start time.</label><div class="slider"><div class="rail"><div id="shift-block" class="block"></div></div><input type="range" id="shift-start" min="540" max="900" step="15" value="${state.start}" aria-label="Two-hour shift start"></div><div class="scale"><span>9:00 AM</span><span>5:00 PM</span></div><p class="conversion">In your timezone (${esc(zoneName(state.localZone))})<strong id="local-time" aria-live="polite">${span(state.localZone)}</strong></p></div><small class="help">Conversion for the week of ${dateLabel(referenceDate().toISOString().slice(0,10))}.</small>`,'workZone',()=>go('phone'));
      const update=()=>{body.querySelector('#shift-block').style.setProperty('--shift',`${(state.start-540)/360*300}%`);body.querySelector('#work-time').textContent=span(state.workZone);body.querySelector('#local-time').textContent=span(state.localZone);body.querySelector('#shift-start').setAttribute('aria-valuetext',span(state.workZone));};
      body.querySelector('#shift-start').oninput=event=>{state.start=Number(event.target.value);update();};update();
    }else if(step==='phone'){
      show('Do you need a US number?',choices('phone',[['needs_number','Yes, I need a US number'],['has_number','No, I already have one'],['google_voice','I have Google Voice']],state.phoneSetup),'window',()=>{const value=selection('phone');if(!value)return invalid('Choose an option for your US calling number.');state.phoneSetup=value;if(value==='needs_number')submit();else go('phoneNumber');},'Submit preferences →');
    }else if(step==='phoneNumber'){
      show(state.phoneSetup==='google_voice'?'What is your Google Voice number?':'What is your US calling number?',`<label class="field" for="us-number">Phone number</label><input id="us-number" type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(formatPhone(state.phoneNumber))}" placeholder="+1(000)000-0000"><small class="help">Enter your 10-digit US number. The +1 and formatting are added automatically.</small>`,'phone',()=>{state.phoneNumber=body.querySelector('#us-number').value;if(!normalizePhone(state.phoneNumber))return invalid('Enter a valid 10-digit US number, or include +1.');submit();},'Submit preferences →');
      const input=body.querySelector('#us-number');
      input.oninput=()=>{input.value=formatPhone(input.value);state.phoneNumber=input.value;};
    }else if(step==='done'){
      show('Great, preference completed.',`<p>Your answers have been submitted to your administrator.</p><dl class="summary"><div><dt>Selected path</dt><dd>${state.path==='hourly'?'Hourly wage':'Commission + bonus'}</dd></div>${state.path==='hourly'?`<div><dt>Start date</dt><dd>${dateLabel(state.startDate)}</dd></div>`:''}<div><dt>Preferred window</dt><dd>${span(state.workZone)}<br>${esc(zoneName(state.workZone))}</dd></div><div><dt>Weekly schedule</dt><dd>2 hours per day, Monday–Friday (10 hours per week)</dd></div><div><dt>US number</dt><dd>${phoneLabel()}${state.phoneSetup==='needs_number'?'':'<br>'+esc(normalizePhone(state.phoneNumber))}</dd></div></dl><p>After each shift, report your time worked, daily updates, and warm leads directly to your administrator. Your official hours form will include timezone conversion.</p>${state.phoneSetup==='needs_number'?'<p>Your administrator will follow up about a US calling number.</p>':''}`,null,close,'Done');
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
