(()=>{'use strict';
const $=s=>document.querySelector(s);const card=()=>$('#selectedLeadTop .lead-card');let activeId='',timer=0;
const REGULAR_CALL_KEY='steadyhands-regular-call-pending-v1';let regularCall=null,regularCallTimer=null;
const tell=t=>{const e=$('#refMessage');if(e)e.textContent=t;};
function currentLead(){
 const c=card(); if(!c||!c.dataset.crmId)return null;
 const number=c.querySelector('.contact-line span')?.textContent?.trim()||'';
 const digits=number.replace(/\D/g,'');
 if(digits.length<10)return null;
 return {c,number,company:c.querySelector('.lead-title h2')?.textContent?.trim()||'',contact:c.querySelector('.lead-title .name')?.textContent?.trim()||'',role:c.querySelector('.lead-title .role')?.textContent?.trim()||'',preview:c.dataset.previewUrl||c.querySelector('.preview-link')?.href||'',timezone:c.dataset.timezone||'',id:c.dataset.crmId};
}
function linkCall(mode){
 const lead=currentLead();if(!lead){tell('Select a prospect with a phone number first.');return;}
 const {id,number,company,contact,role,preview,timezone}=lead;
 try{sessionStorage.setItem('steadyhands-selected-outreach-crm-id',id);sessionStorage.setItem('steadyhands-outreach-call-handoff',JSON.stringify({id,number,company,contact,role,preview,timezone}));}catch{}
 if(mode==='regular'){openRegularPhonePopup(number);return;}
 // Calling through Outreach requires administrator setup; never open call.html here.
 openOutreachSetupPopup();
}

function openOutreachSetupPopup(){
  let overlay=$('#refOutreachSetupPopup');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='refOutreachSetupPopup';
    overlay.className='ref-phone-modal ref-setup-modal';
    overlay.hidden=true;
    overlay.innerHTML=`<div class="ref-phone-dialog ref-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="refSetupTitle" aria-describedby="refSetupDescription">
      <button type="button" class="ref-phone-close" id="refSetupClose" aria-label="Close">×</button>
      <h2 id="refSetupTitle">Call Through Outreach setup required</h2>
      <p id="refSetupDescription">You need to verify your phone number before calling through Outreach. Please contact your administrator to get set up.</p>
      <div class="ref-setup-actions">
        <button type="button" class="ref-setup-contact" id="refSetupContact">Contact Administrator</button>
        <button type="button" class="ref-setup-cancel" id="refSetupCancel">Cancel</button>
      </div>
      <p class="ref-phone-feedback" id="refSetupFeedback" role="status" aria-live="polite"></p>
    </div>`;
    document.body.append(overlay);
    const close=()=>{overlay.hidden=true;$('#refAppPhone')?.focus();};
    $('#refSetupClose').addEventListener('click',close);
    $('#refSetupCancel').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)close();});
    $('#refSetupContact').addEventListener('click',async()=>{
      const btn=$('#refSetupContact'), feedback=$('#refSetupFeedback');
      const client=window.steadyHandsCRMClient;
      if(!client){feedback.textContent='Unable to connect to Requests. Please try again when signed in.';return;}
      btn.disabled=true;btn.textContent='Sending request...';feedback.textContent='';
      try{
        const {error}=await client.rpc('request_app_call_verification');
        if(error)throw error;
        feedback.textContent='Request submitted to your administrator.';
        btn.textContent='Request sent';
      }catch(error){
        feedback.textContent='Request could not be sent. Please contact your administrator directly.';
        console.error('Outreach setup request failed:',error);
        btn.disabled=false;btn.textContent='Contact Administrator';
      }
    });
  }
  $('#refSetupFeedback').textContent='';
  const btn=$('#refSetupContact');
  btn.disabled=false;btn.textContent='Contact Administrator';
  overlay.hidden=false;
  btn.focus();
}

function openRegularPhonePopup(phone){
  const number=String(phone||'').trim();
  if(number.replace(/\D/g,'').length<10){tell('Select a prospect with a valid phone number first.');return;}
  let popup=$('#refPhonePopup');
  if(!popup){
    popup=document.createElement('div');popup.id='refPhonePopup';popup.className='ref-phone-modal';popup.hidden=true;
    popup.innerHTML=`<div class="ref-phone-dialog" role="dialog" aria-modal="true" aria-labelledby="refPhoneDialogTitle">
      <button type="button" class="ref-phone-close" id="refPhoneClose" aria-label="Close">×</button>
      <h2 id="refPhoneDialogTitle">Regular Phone</h2>
      <p>Call this prospect using your phone.</p>
      <div class="ref-phone-number" id="refPhonePopupNumber"></div>
      <div class="ref-phone-actions"><a id="refOpenDialer" class="ref-phone-dialer" href="#">Open Dialer</a>
      <button type="button" id="refCopyPhone">Copy Phone Number</button></div>
      <p id="refPhonePopupFeedback" class="ref-phone-feedback" role="status" aria-live="polite"></p>
    </div>`;
    document.body.append(popup);
    const close=()=>{popup.hidden=true;$('#refRegularPhone')?.focus();};
    $('#refPhoneClose').addEventListener('click',close);
    $('#refOpenDialer').addEventListener('click',()=>{
      const lead=currentLead();
      if(!lead)return;
      beginRegularCall(lead);
      close();
    });
    popup.addEventListener('click',e=>{if(e.target===popup)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!popup.hidden)close();});
    $('#refCopyPhone').addEventListener('click',async()=>{
      const value=popup.dataset.phone||'';
      try{
        if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
        else {
          const el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.opacity='0';document.body.append(el);el.select();
          if(!document.execCommand('copy'))throw new Error('Copy unavailable');el.remove();
        }
        $('#refPhonePopupFeedback').textContent='Phone number copied.';
      }catch{$('#refPhonePopupFeedback').textContent='Unable to copy automatically. Please select the number above.';}
    });
  }
  popup.dataset.phone=number;
  $('#refPhonePopupNumber').textContent=number;
  $('#refOpenDialer').href='tel:'+number.replace(/[^+0-9]/g,'');
  $('#refPhonePopupFeedback').textContent='';
  popup.hidden=false;
  $('#refOpenDialer').focus();
}
function readPendingRegularCall(){
 try {
  const value=JSON.parse(sessionStorage.getItem(REGULAR_CALL_KEY)||'null');
  if(value&&typeof value.id==='string'&&Number.isFinite(value.startedAt)&&value.startedAt>0)return value;
 }catch{}
 return null;
}
function savePendingRegularCall(){
 try{if(regularCall)sessionStorage.setItem(REGULAR_CALL_KEY,JSON.stringify(regularCall));else sessionStorage.removeItem(REGULAR_CALL_KEY);}catch{}
}
function ensureRegularCallPanel(){
 const methods=$('.ref-call-methods');if(!methods)return null;
 let panel=$('#refRegularCallTracker');
 if(!panel){
  panel=document.createElement('div');panel.id='refRegularCallTracker';panel.className='ref-regular-call-tracker';panel.hidden=true;
  panel.innerHTML=`<div class="ref-regular-call-time"><span class="ref-regular-call-label">Regular Phone · Elapsed time</span><strong id="refRegularElapsed">00:00</strong></div><div class="ref-regular-call-actions"><button type="button" id="refRegularFinish">Finish Call</button><button type="button" id="refRegularDidNotCall">Didn't Call</button></div>`;
  methods.insertAdjacentElement('afterend',panel);
  $('#refRegularFinish').addEventListener('click',()=>finishRegularCall(true));
  $('#refRegularDidNotCall').addEventListener('click',()=>finishRegularCall(false));
 }
 return panel;
}
function renderRegularCall(){
 const panel=ensureRegularCallPanel(),methods=$('.ref-call-methods');if(!panel||!methods)return;
 // Do not expose the timer against a different selected prospect.
 const c=card();const displayedId=c?.dataset.crmId||'';
 const showing=!!regularCall&&(!displayedId||regularCall.id===displayedId);
 methods.hidden=showing;
 methods.classList.toggle('ref-methods-hidden',showing);
 panel.hidden=!showing;
 if(showing){
  const elapsed=Math.max(0,Math.floor((Date.now()-regularCall.startedAt)/1000));
  const mins=Math.floor(elapsed/60),secs=elapsed%60;
  const hours=Math.floor(mins/60);
  $('#refRegularElapsed').textContent=hours?`${String(hours).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
 }
}
function beginRegularCall(lead){
 if(regularCall)return;
 regularCall={id:lead.id,company:lead.company,startedAt:Date.now()};
 savePendingRegularCall();renderRegularCall();
}
function finishRegularCall(wasCalled){
 if(!regularCall)return;
 // Preserve the prospect and elapsed time before removing the inline timer.
 const current=regularCall;
 const elapsed=Math.max(0,Math.floor((Date.now()-current.startedAt)/1000));
 const detail={crm_id:current.id,company:current.company||'',elapsed_seconds:elapsed,verified:false,called:!!wasCalled};
 // Open the questionnaire first; do not silently discard the call if the
 // questionnaire bundle is absent or blocked from loading.
 const opener=window.steadyHandsOpenPostCallQuestionnaire;
 if(typeof opener!=='function'){
  tell('Questionnaire is not ready. Refresh Outreach and try Finish Call again.');
  return;
 }
 try{
  const opened=opener(detail);
  if(opened===false){tell('Unable to open the questionnaire. Please try again.');return;}
  regularCall=null;savePendingRegularCall();renderRegularCall();
 }catch(ex){console.error('Post-call questionnaire failed to open',ex);tell('Could not open the questionnaire. Refresh and try again.');}
}

function recommendedCallStatus(c, fallbackZone=''){
  const zone=timeZone(c)||fallbackZone;
  if(!zone)return null;
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date());
    const day=parts.find(p=>p.type==='weekday')?.value;
    const hour=Number(parts.find(p=>p.type==='hour')?.value);
    return ['Mon','Tue','Wed','Thu','Fri'].includes(day)&&hour>=9&&hour<17;
  }catch{return null;}
}

async function chooseTool(key){const c=card();if(!c){tell('Select a lead first.');return;}if(key==='calendar'){const b=c.querySelector('.calendar-btn');if(b){b.click();return;}}
if(key==='preview'){const tab=window.open('about:blank','_blank');try{const url=await window.SteadyHandsPreviews.resolveCRM(c.dataset.crmId);if(tab)tab.location.replace(url);else window.location.assign(url);}catch(e){if(tab)tab.close();tell(e.message||'No verified site preview available.');}return;}
if(key==='notes'){const el=$('#workspaceQuickNotesInput');if(el){el.focus();el.scrollIntoView({behavior:'smooth'});return;}}
if(key==='quick'){const pane=$('#shCallInfo');if(pane){pane.scrollIntoView({behavior:'smooth'});tell('Lead details shown in Call Information.');return;}}
const b=c.querySelector('.call-btn[data-select-lead]');if(b){b.click();return;}tell('Open the call workspace to use this tool.');}
function timeZone(c){const raw=c?.dataset.timezone||'';if(raw.includes('/'))return raw;const z=raw.toLowerCase();if(z.includes('pacific')||z==='pst'||z==='pdt')return 'America/Los_Angeles';if(z.includes('mountain')||z==='mst'||z==='mdt')return 'America/Denver';if(z.includes('central')||z==='cst'||z==='cdt')return 'America/Chicago';if(z.includes('eastern')||z==='est'||z==='edt')return 'America/New_York';return ''}
function resolvedZone(c){
  const explicit=timeZone(c);
  if(explicit)return explicit;
  const number=c?.querySelector('.contact-line span')?.textContent?.trim()||'';
  if(typeof callcenterLeadZone==='function' && number){
    try{return callcenterLeadZone(number,c?.dataset.timezone||'').zone||'';}catch{}
  }
  const label=c?.querySelector('.compact-local-time')?.textContent||'';
  const match=label.match(/(Pacific|Arizona|Mountain|Central|Eastern|Alaska|Hawaii) Time/i);
  return match?({'pacific':'America/Los_Angeles','arizona':'America/Phoenix','mountain':'America/Denver','central':'America/Chicago','eastern':'America/New_York','alaska':'America/Anchorage','hawaii':'Pacific/Honolulu'}[match[1].toLowerCase()]||''):'';
}
function clock(){const c=card(),el=$('#refLocalTime');if(!el)return;if(!c){el.textContent='Local time unavailable';return;}const zone=resolvedZone(c)||(!c&&document.querySelector('.ref-active-panel')?timeZone({dataset:{timezone:new URLSearchParams(location.search).get('timezone')||''}}):'');if(!zone){el.textContent=c.querySelector('.compact-local-time')?.textContent?.trim()||'Local time unavailable';return;}try{el.textContent=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'long',hour:'numeric',minute:'2-digit'}).format(new Date());}catch{el.textContent='Local time unavailable';}}
async function attempts(id){$('#refAttempts').textContent='—';const client=window.steadyHandsCRMClient;if(!client||!id)return;try{const {count,error}=await client.from('callcenter_call_activity').select('*',{count:'exact',head:true}).eq('crm_id',id);if(!error&&activeId===id)$('#refAttempts').textContent=String(count||0);}catch{}}
function update(){
 const callPage=!!document.querySelector('.ref-active-panel');
 const params=new URLSearchParams(location.search);
 const passedId=callPage?params.get('crm_id'):null;
 const c=card();let id=c?.dataset.crmId||'';
 // The Call page must never silently display a different prospect.
 const matches=!!c&&(!passedId||id===passedId);
 const passedNumber=callPage?params.get('number')||'':'';
 const passedPhoneValid=passedNumber.replace(/\D/g,'').length>=10;
 const lead=matches?currentLead():null;
 const ready=!!lead||!!(passedId&&passedPhoneValid);
 const company=lead?.company||(passedId?params.get('company')||'Prospect':'');
 const phone=lead?.number||(passedId?passedNumber:'');
 if(!ready){
  const loading=!!document.querySelector('#selectedLeadTop .skeleton-lead')||document.querySelector('#crmStatus')?.textContent?.includes('Connecting');
  $('#refCompany').textContent=loading?'Loading prospect...':c?'Prospect':'No prospect selected';
  $('#refPhone').textContent=loading?'Retrieving contact information':c?'No phone number on file':'No phone number on file';
  $('#refStatus').textContent=loading?'Please wait':'No phone number on file';
 }else{
  $('#refCompany').textContent=company||'Prospect';
  $('#refPhone').textContent=phone;
  const zone=lead?resolvedZone(lead.c):timeZone({dataset:{timezone:params.get('timezone')||''}});
  const withinHours=recommendedCallStatus(lead?.c,zone);
  $('#refStatus').textContent=withinHours===false?'Outside of recommended calling hours':withinHours===true?'Ready to call':'Calling hours unavailable';
 }
 const dot=$('.ref-status .ref-green-dot');
 if(dot){const outside=ready&&$('#refStatus')?.textContent==='Outside of recommended calling hours';dot.classList.toggle('ref-red-dot',outside);dot.classList.toggle('ref-neutral-dot',!ready||(!outside&&$('#refStatus')?.textContent!=='Ready to call'));}
 for(const id of ['refRegularPhone','refAppPhone']){
  const button=$('#'+id);if(!button)continue;
  button.disabled=!ready;
  button.setAttribute('aria-disabled',String(!ready));
  button.title=ready?'':'Select a prospect with a valid phone number first';
 }
 const timeEl=$('#refLocalTime');
 if(callPage&&passedId&&!matches){
  if(timeEl)timeEl.textContent=ready?'Local time unavailable':'Loading local time...';
 }else if(!ready){
  if(timeEl)timeEl.textContent='Loading local time...';
 }else clock();
 if(activeId!==id&&id){activeId=id;attempts(id);}
}


// Stage editor opens directly from the selected prospect (no navigation to Sales Pipeline).
const pipelineStageOptions=[['called','Called'],['follow_up','Follow-up'],['portal_link_sent','Portal Link Sent'],['account_created','Account Created'],['reviewing_site','Reviewing Site'],['ready_to_buy','Ready to Buy'],['cancelled','Cancelled']];
const pipelineFollowupOptions=['Interested','Unsure','Needs More Info','Not Now','Budget Concerns'];
const safePipelineText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function openPipelineStagePopup(){
 const c=card(),crmId=c?.dataset.crmId;
 if(!crmId){tell('Select a lead first.');return;}
 const name=c.querySelector('.lead-title h2')?.textContent?.trim()||'Selected prospect';
 const client=window.steadyHandsCRMClient;
 if(!client){tell('CRM connection is not ready. Please try again.');return;}
 document.querySelector('#shDirectPipelinePopup')?.remove();
 const overlay=document.createElement('div');overlay.id='shDirectPipelinePopup';
 overlay.innerHTML=`<div class="sh-direct-stage-dialog" role="dialog" aria-modal="true" aria-labelledby="shDirectStageTitle">
 <header><div><h2 id="shDirectStageTitle">Start Sale / Track Customer</h2><p>${safePipelineText(name)}</p></div><button type="button" data-stage-close aria-label="Close popup">×</button></header>
 <form id="shDirectStageForm"><section class="sh-stage-section"><h3>Pipeline stage</h3><p class="sh-stage-help">Choose where this prospect belongs.</p><div id="shDirectStageCards" class="sh-stage-cards" role="radiogroup" aria-label="Pipeline stage">${pipelineStageOptions.map(([value,label],i)=>`<button type="button" class="sh-stage-card" role="radio" aria-checked="false" data-stage="${value}"><span class="sh-stage-number">${value==='cancelled'?'×':i+1}</span><span class="sh-stage-name">${label}</span><span class="sh-stage-check">✓</span></button>`).join('')}</div><input type="hidden" id="shDirectStage" value="called"></section>
 <section id="shDirectFollowupWrap" class="sh-stage-section" hidden><h3>Follow-up category</h3><div class="sh-followup-grid">${pipelineFollowupOptions.map(label=>`<button type="button" class="sh-followup-choice" data-followup="${safePipelineText(label)}" aria-pressed="false">${safePipelineText(label)}</button>`).join('')}</div><input type="hidden" id="shDirectFollowup" value=""></section>
 <label>CRM notes<textarea id="shDirectStageNotes" rows="3" maxlength="3000" placeholder="Add information about this prospect (optional)"></textarea></label>
 <p id="shDirectStageStatus" role="status" aria-live="polite">Loading current stage…</p>
 <footer><button type="button" data-stage-close>Cancel</button><button type="submit" id="shDirectStageSave">Save Stage</button></footer></form></div>`;
 Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'999999',background:'rgba(9,24,50,.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'});
 const style=document.createElement('style');style.textContent=`
 #shDirectPipelinePopup .sh-direct-stage-dialog{background:#fff;color:#0c2248;border-radius:22px;padding:25px;width:min(565px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;box-shadow:0 24px 75px #07172b66;font-family:inherit}
 #shDirectPipelinePopup header{display:flex;justify-content:space-between;align-items:start;gap:15px;margin-bottom:21px}
 #shDirectPipelinePopup h2{margin:0 0 6px;font-size:24px;font-weight:800;line-height:1.2}
 #shDirectPipelinePopup header p{margin:0;color:#657895;font-size:14px}
 #shDirectPipelinePopup [data-stage-close]{cursor:pointer}
 #shDirectPipelinePopup header button{border:0;background:#eef4fa;border-radius:11px;width:38px;height:38px;font-size:25px;color:#1c3159;flex-shrink:0}
 #shDirectPipelinePopup form{display:grid;gap:18px}
 #shDirectPipelinePopup .sh-stage-section{display:grid;gap:10px}
 #shDirectPipelinePopup #shDirectFollowupWrap[hidden]{display:none!important}
 #shDirectPipelinePopup h3{margin:0;font-size:15px;font-weight:800;color:#122d57}
 #shDirectPipelinePopup .sh-stage-help{font-size:12px;color:#71819a;margin:-5px 0 0}
 #shDirectPipelinePopup .sh-stage-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 #shDirectPipelinePopup .sh-stage-card{min-width:0;display:flex;align-items:center;gap:10px;min-height:60px;text-align:left;padding:10px 12px;border:1.5px solid #dce6f2;border-radius:13px;background:#fff;color:#163058;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
 #shDirectPipelinePopup .sh-stage-card:hover{background:#f5faff;border-color:#8bc4ff}
 #shDirectPipelinePopup .sh-stage-card[aria-checked=true]{background:#eaf5ff;border-color:#0786ff;box-shadow:0 0 0 1px #0786ff}
 #shDirectPipelinePopup .sh-stage-number{display:grid;place-items:center;flex:0 0 34px;height:34px;border-radius:9px;background:#eaf5ff;color:#0786ff;font-size:17px;font-weight:800}
 #shDirectPipelinePopup .sh-stage-card[aria-checked=true] .sh-stage-number{background:#1285f9;color:white}
 #shDirectPipelinePopup .sh-stage-name{font-size:13px;line-height:1.28;font-weight:750;flex:1}
 #shDirectPipelinePopup .sh-stage-check{visibility:hidden;font-size:17px;font-weight:800;color:#0786ff}
 #shDirectPipelinePopup .sh-stage-card[aria-checked=true] .sh-stage-check{visibility:visible}
 #shDirectPipelinePopup .sh-followup-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
 #shDirectPipelinePopup .sh-followup-choice{border:1px solid #dce6f2;background:#fff;color:#23436d;border-radius:11px;padding:11px 9px;font-size:13px;font-weight:700;cursor:pointer}
 #shDirectPipelinePopup .sh-followup-choice[aria-pressed=true]{background:#eaf5ff;border-color:#0786ff;color:#006de0}
 #shDirectPipelinePopup label{display:grid;gap:8px;font-size:14px;font-weight:800;color:#122d57}
 #shDirectPipelinePopup textarea{box-sizing:border-box;width:100%;min-height:85px;border:1px solid #d2dceb;border-radius:12px;background:#fff;color:#10284f;padding:12px;font:inherit;font-size:14px;resize:vertical}
 #shDirectPipelinePopup textarea:focus{outline:2px solid #8fc4ff;outline-offset:1px}
 #shDirectPipelinePopup #shDirectStageStatus{margin:0;min-height:18px;color:#526887;font-size:12px}
 #shDirectPipelinePopup footer{display:flex;gap:10px;justify-content:flex-end;padding-top:2px}
 #shDirectPipelinePopup footer button{border-radius:11px;padding:12px 19px;border:1px solid #d2dceb;font-weight:750;background:#fff;color:#123058;cursor:pointer}
 #shDirectPipelinePopup footer button[type=submit]{background:#1385fb;border-color:#1385fb;color:#fff}
 #shDirectPipelinePopup footer button:disabled{opacity:.55;cursor:wait}
 @media(max-width:480px){#shDirectPipelinePopup .sh-direct-stage-dialog{padding:18px;border-radius:18px}#shDirectPipelinePopup h2{font-size:21px}#shDirectPipelinePopup .sh-stage-card{padding:8px;gap:7px;min-height:57px}#shDirectPipelinePopup .sh-stage-number{flex-basis:29px;height:29px}#shDirectPipelinePopup .sh-stage-name{font-size:12px}#shDirectPipelinePopup footer button{flex:1}}
 `;
 overlay.prepend(style);document.body.append(overlay);
 const select=overlay.querySelector('#shDirectStage');const follow=overlay.querySelector('#shDirectFollowup');const notes=overlay.querySelector('#shDirectStageNotes');const status=overlay.querySelector('#shDirectStageStatus');const save=overlay.querySelector('#shDirectStageSave');
 const updateFollow=()=>{const wrap=overlay.querySelector('#shDirectFollowupWrap');wrap.hidden=select.value!=='follow_up';overlay.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.stage===select.value)));};
 const chooseStage=value=>{select.value=value;updateFollow();};
 overlay.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>chooseStage(b.dataset.stage)));
 overlay.querySelectorAll('[data-followup]').forEach(b=>b.addEventListener('click',()=>{follow.value=b.dataset.followup;overlay.querySelectorAll('[data-followup]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.followup===follow.value)));}));
 const syncFollow=()=>overlay.querySelectorAll('[data-followup]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.followup===follow.value)));
 updateFollow();
 const close=()=>{document.removeEventListener('keydown',escKey);overlay.remove();};
 const escKey=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',escKey);
 overlay.querySelectorAll('[data-stage-close]').forEach(b=>b.addEventListener('click',close));
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.querySelector('[data-stage=called]')?.focus();
 try{
  const {data,error}=await client.from('sh_pipeline_records').select('stage,follow_up_category,notes').eq('crm_id',String(crmId)).limit(1);
  if(!overlay.isConnected)return;
  if(error)throw error;
  if(data?.length){select.value=data[0].stage||'called';follow.value=data[0].follow_up_category||'';notes.value=data[0].notes||'';status.textContent='Current stage loaded.';}
  else status.textContent='Choose the stage to start tracking this prospect.';
  updateFollow();syncFollow();
 }catch(error){if(overlay.isConnected)status.textContent='Could not load previous stage. You can still choose one and save.';console.warn('Pipeline stage lookup failed',error)}
 overlay.querySelector('#shDirectStageForm').addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;status.textContent='Saving pipeline stage…';
  try{
   const {error}=await client.rpc('sh_save_pipeline_stage',{p_crm_id:String(crmId),p_stage:select.value,p_follow_up_category:select.value==='follow_up'?(follow.value||null):null,p_notes:notes.value});
   if(error)throw error;
   tell('Pipeline stage saved: '+(pipelineStageOptions.find(p=>p[0]===select.value)?.[1]||select.value));close();
  }catch(error){status.textContent='Could not save: '+(error.message||'Please try again.');save.disabled=false;}
 });
}

function wire(){const root=$('#refOutreachMain');if(!root)return;
regularCall=readPendingRegularCall();ensureRegularCallPanel();renderRegularCall();regularCallTimer=setInterval(renderRegularCall,1000);window.addEventListener('pageshow',renderRegularCall);document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderRegularCall();});$('#refRegularPhone')?.addEventListener('click',()=>linkCall('regular'));$('#refAppPhone')?.addEventListener('click',()=>linkCall('app'));
$('#refRandomLead')?.addEventListener('click',()=>{const b=[...document.querySelectorAll('#selectedLeadTop .quick-btn')].find(b=>/random/i.test(b.textContent));if(b)b.click();else tell('Random lead selection is unavailable right now.');});
$('#refNextQueue')?.addEventListener('click',()=>{const b=$('#shQueueNext');if(b)b.click();else tell('Queue is loading. Try again shortly.');});
$('#refStartSale')?.addEventListener('click',openPipelineStagePopup);
root.querySelectorAll('[data-ref-tool]').forEach(b=>b.addEventListener('click',()=>chooseTool(b.dataset.refTool)));
// Reuse the existing Calendar tool in the 3-button mobile navigation row.
const calendarTool=root.querySelector('[data-ref-tool="calendar"]');
const toolGrid=root.querySelector('.ref-tools');
const navGrid=root.querySelector('.ref-next-buttons');
const mobile=window.matchMedia('(max-width:720px)');
function arrangeMobileTools(){
 if(!calendarTool||!toolGrid||!navGrid)return;
 if(mobile.matches && calendarTool.parentNode!==navGrid){navGrid.appendChild(calendarTool);}
 else if(!mobile.matches && calendarTool.parentNode!==toolGrid){toolGrid.appendChild(calendarTool);}
}
arrangeMobileTools();
mobile.addEventListener?.('change',arrangeMobileTools);
const original=$('#selectedLeadTop');if(original)new MutationObserver(()=>requestAnimationFrame(()=>{update();renderRegularCall();})).observe(original,{childList:true,subtree:false});update();renderRegularCall();timer=setInterval(update,30000);window.lucide?.createIcons?.();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
