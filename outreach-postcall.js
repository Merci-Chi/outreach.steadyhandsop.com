/* Shared post-call questionnaire. Browser timing is an estimate, never verified duration. */
(()=>{'use strict';
const q=(s,r=document)=>r.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage='steadyhands:outreach-feedback-pending-v2',draftStorage='steadyhands:outreach-feedback-drafts-v3';
let pending=null,submitting=false,regularActive=false,drafts=[],seen=new Set();
try{const saved=JSON.parse(sessionStorage.getItem(draftStorage)||'null');drafts=Array.isArray(saved?.drafts)?saved.drafts.filter(d=>d?.crm_id&&d?.event_id):[];seen=new Set(Array.isArray(saved?.seen)?saved.seen:[]);}catch{}
// Older unfinished records remain recoverable, but never open on page load.
try{const old=JSON.parse(sessionStorage.getItem(storage)||'null');if(old?.crm_id&&old?.event_id&&!drafts.some(d=>d.event_id===old.event_id))drafts.push(old);}catch{}
function persist(){try{sessionStorage.setItem(draftStorage,JSON.stringify({drafts,seen:[...seen]}));sessionStorage.removeItem(storage);}catch{}}
function storeDraft(d){const index=drafts.findIndex(item=>item.event_id===d.event_id);if(index<0)drafts.push(d);else drafts[index]=d;persist();}
function captureAnswers(){
 const form=q('#shFeedbackForm');if(!pending||!q('#shFeedbackOverlay')||!form)return;
 const data=new FormData(form);
 pending.answers={outcome:String(data.get('outcome')||''),interest:data.getAll('interest'),notes:String(data.get('notes')||''),...Object.fromEntries(['portal_link_sent','registered','site_reviewed','ready_to_buy'].map(k=>[k,data.has(k)]))};
 storeDraft(pending);
}
function hideActive(){captureAnswers();q('#shFeedbackOverlay')?.remove();pending=null;renderDrafts();}
function renderDrafts(){
 const host=q('main.content');if(!host)return;
 let panel=q('#shFeedbackDrafts');
 if(!drafts.length){panel?.remove();return;}
 addOutcomeStyle();
 if(!panel){panel=document.createElement('details');panel.id='shFeedbackDrafts';panel.className='card sh-feedback-drafts';host.prepend(panel);}
 panel.innerHTML='<summary>Unfinished call results ('+drafts.length+')</summary>'+drafts.map(d=>'<button type="button" class="sh-tool-btn" data-feedback-draft="'+esc(d.event_id)+'">Resume · '+esc(d.company||'Prospect')+'</button>').join('');
 panel.onclick=event=>{const id=event.target.closest?.('[data-feedback-draft]')?.dataset.feedbackDraft;if(id)window.steadyHandsResumePostCallQuestionnaire(id);};
}
window.steadyHandsResumePostCallQuestionnaire=id=>{
 if(regularActive||window.SteadyHandsTwilioVoice?.isActive?.())return false;
 const draft=drafts.find(d=>d.event_id===id);if(!draft)return false;
 captureAnswers();pending=draft;view();return true;
};
const client=()=>window.steadyHandsCRMClient;
const choices=[['good','thumbs-up','Good'],['bad','thumbs-down','Bad'],['left_voicemail','voicemail','Voicemail'],['follow_up','calendar-clock','Follow Up'],['no_answer','phone-off','No Answer'],['did_not_call','skip-forward','Did not Call']];
function addOutcomeStyle(){
 if(q('#shOutcomeStyle'))return;
 const style=document.createElement('style');style.id='shOutcomeStyle';
 style.textContent='.sh-feedback-drafts{padding:12px 16px;margin-bottom:14px}.sh-feedback-drafts summary{cursor:pointer;font-size:13px;font-weight:700}.sh-feedback-drafts button{margin:10px 8px 0 0;font-size:12px}#shFeedbackOverlay .sh-outcomes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}#shFeedbackOverlay .sh-outcome{display:flex;gap:9px;align-items:center;position:relative;min-height:60px;padding:11px;border:2px solid #d3dfe8;border-radius:14px;background:white;cursor:pointer;color:#243a51}#shFeedbackOverlay .sh-outcome input{position:absolute;opacity:0;width:1px;height:1px}#shFeedbackOverlay .sh-outcome:has(input:checked){background:#e9f2ff;border-color:#176be0;box-shadow:inset 0 2px 5px #b7d5fa;transform:translateY(2px)}#shFeedbackOverlay .sh-outcome:has(input:focus-visible){outline:3px solid #fbbf24;outline-offset:2px}#shFeedbackOverlay .sh-outcome b{font-size:14px}#shFeedbackOverlay .sh-outcome svg{width:20px;height:20px;flex:none}#shFeedbackOverlay .sh-call-duration svg{width:17px;height:17px;vertical-align:middle;margin-right:5px}#shFeedbackOverlay .sh-call-duration{background:#e8f0f8;border-radius:10px;padding:10px;font-size:13px;margin:0}@media(max-width:360px){#shFeedbackOverlay .sh-outcomes{grid-template-columns:1fr}}';
 document.head.append(style);
}
function renderIcons(root){if(window.lucide?.createIcons)window.lucide.createIcons({nodes:root.querySelectorAll('[data-lucide]')});}
function view(){
 let overlay=q('#shFeedbackOverlay');if(!overlay){overlay=document.createElement('div');overlay.id='shFeedbackOverlay';overlay.className='sh-tool-mask';document.body.append(overlay);}
 if(!pending){overlay.remove();return;}
 addOutcomeStyle();
 const secs=Math.max(0,Math.min(86400,Number(pending.elapsed_seconds)||0));
 const duration=Math.floor(secs/60)+'m '+Math.floor(secs%60)+'s';
 const answers=pending.answers||{},selected=answers.outcome||(pending.called===false?'did_not_call':'good');
 overlay.innerHTML=`<section class="sh-tool-sheet" role="dialog" aria-modal="true" aria-labelledby="shFeedbackTitle"><div class="sh-sheet-handle"></div><div class="sh-sheet-head"><h2 id="shFeedbackTitle">How did it go?</h2><button type="button" class="sh-sheet-x" id="shFeedbackLater" aria-label="Close">×</button></div><form class="sh-sheet-body" id="shFeedbackForm"><p class="sh-sheet-help">${esc(pending.company||'Prospect')} · ${pending.call_method==='outreach'?'Outreach Call':'Regular Phone'}</p><p class="sh-call-duration"><i data-lucide="timer" aria-hidden="true"></i> Call timer: <strong>${duration}</strong> (${pending.call_method==='outreach'?'browser timer estimate':'manually timed'})</p><fieldset class="sh-feedback-interest"><legend>Call outcome</legend><div class="sh-outcomes">${choices.map(([value,icon,label])=>`<label class="sh-outcome"><input type="radio" name="outcome" value="${value}" ${value===selected?'checked':''} required><i data-lucide="${icon}" aria-hidden="true"></i><b>${label}</b></label>`).join('')}</div></fieldset><fieldset class="sh-feedback-interest"><legend>Follow-up details (optional)</legend>${['Interested','Skeptical','Needs More Info','Later','Money Problems'].map(v=>`<label><input type="checkbox" name="interest" value="${v}" ${answers.interest?.includes(v)?'checked':''}> ${v}</label>`).join('')}</fieldset><div class="sh-feedback-flags">${[['portal_link_sent','Client portal link sent'],['registered','Client registered'],['site_reviewed','Client reviewed site'],['ready_to_buy','Ready to buy']].map(([n,label])=>`<label><input type="checkbox" name="${n}" ${answers[n]?'checked':''}> ${label}</label>`).join('')}</div><label class="sh-field-label">Notes<textarea class="sh-note-input" name="notes" placeholder="What happened during this call?">${esc(answers.notes||'')}</textarea></label><button class="sh-sheet-primary" type="submit" id="shFeedbackSave">Save Call Result</button><p class="sh-sheet-status" id="shFeedbackStatus" role="status"></p></form></section>`;
 renderIcons(overlay);
 q('#shFeedbackLater',overlay).onclick=hideActive;
 const form=q('#shFeedbackForm',overlay);form.onsubmit=save;form.oninput=captureAnswers;form.onchange=captureAnswers;
}
async function save(e){e.preventDefault();if(!pending||submitting)return;const result=pending,overlay=q('#shFeedbackOverlay'),c=client(),f=e.currentTarget,btn=q('#shFeedbackSave'),message=q('#shFeedbackStatus');captureAnswers();if(!c){message.textContent='Sign in before saving.';return;}submitting=true;btn.disabled=true;
 try{const d=new FormData(f);const selected=String(d.get('outcome')||'');
 if(!choices.some(x=>x[0]===selected))throw new Error('Choose an outcome.');
 const mapped={good:'called',bad:'not_interested',left_voicemail:'called',follow_up:'follow_up',no_answer:'called',did_not_call:'did_not_call'};
 const prefix={good:'Good call.',bad:'Bad call / not interested.',left_voicemail:'Left a voicemail.',no_answer:'No answer.'}[selected]||'';
 const args={p_crm_id:result.crm_id,p_client_event_id:result.event_id,p_outcome:mapped[selected],p_elapsed_seconds:Math.max(0,Math.min(86400,Number(result.elapsed_seconds)||0)),p_interest_stages:d.getAll('interest'),p_notes:[prefix,String(d.get('notes')||'').trim()].filter(Boolean).join('\n'),p_portal_link_sent:d.has('portal_link_sent'),p_registered:d.has('registered'),p_site_reviewed:d.has('site_reviewed'),p_ready_to_buy:d.has('ready_to_buy')};const isVoicemail=selected==='left_voicemail';
 if(result.call_method==='outreach'){
   const {data:auth,error:authError}=await c.auth.getUser();if(authError)throw authError;
   if(!auth?.user)throw Error('Sign in before saving.');
   // Calls can end before Twilio assigns a SID. Reuse only this attempt's
   // saved activity ID; never guess by taking the lead's most recent call.
   let activity=null;
   if(result.activity_id || result.call_sid){
     let lookup=c.from('callcenter_call_activity').select('id').eq('crm_id',result.crm_id).eq('user_id',auth.user.id);
     lookup=result.activity_id?lookup.eq('id',result.activity_id):lookup.eq('call_sid',result.call_sid);
     const lookupResult=await lookup.maybeSingle();
     if(lookupResult.error)throw lookupResult.error;
     activity=lookupResult.data;
   }
   if(!activity){
     if(typeof window.callcenterRecordCall!=='function')throw Error('Call logging is not ready. Keep this form open and try again.');
     activity=await window.callcenterRecordCall({crmId:result.crm_id,callSid:result.call_sid||'',duration:0,outcome:args.p_outcome,endedAt:Date.now()});
     if(!activity?.id)throw Error('The call record could not be saved. Try Save Call Result again.');
     result.activity_id=activity.id;
     storeDraft(result);
   }
   const {error}=await c.from('callcenter_post_call_questionnaires').upsert({call_activity_id:activity.id,user_id:auth.user.id,crm_id:result.crm_id,outcome:args.p_outcome,interest_stages:args.p_interest_stages,notes:args.p_notes,portal_link_sent:args.p_portal_link_sent,registered:args.p_registered,site_reviewed:args.p_site_reviewed,ready_to_buy:args.p_ready_to_buy,client_event_id:result.event_id,call_method:'outreach',elapsed_seconds_estimate:args.p_elapsed_seconds},{onConflict:'call_activity_id'});
   if(error)throw error;
 }else{
   const {error}=await c.rpc('record_regular_outreach_call_v1',args);if(error)throw error;
 }
 if(isVoicemail){
   const {data:lead,error:readError}=await c.from('crm').select('tags').eq('id',result.crm_id).single();
   if(readError)throw new Error('Call recorded, but the voicemail tag could not be loaded: '+readError.message);
   const tags=Array.isArray(lead?.tags)?lead.tags.filter(x=>typeof x==='string'):[];
   if(!tags.some(x=>x.trim().toLowerCase()==='left voicemail'))tags.push('Left Voicemail');
   const {error:tagError}=await c.from('crm').update({tags,outcome:'Left Voicemail'}).eq('id',result.crm_id);
   if(tagError)throw new Error('Call recorded, but the voicemail tag could not be saved: '+tagError.message);
 }
 drafts=drafts.filter(d=>d.event_id!==result.event_id);persist();if(pending===result)pending=null;renderDrafts();message.textContent='Saved to Supabase.';setTimeout(()=>{if(!pending||pending.event_id===result.event_id)overlay?.remove();window.dispatchEvent(new CustomEvent('steadyhands:activity-updated'));},400);
 }catch(ex){console.error('Questionnaire save failed:',ex);message.textContent=`Not saved: ${ex.message||'Try again'}. Your answers are still here.`;}
 finally{submitting=false;if(btn?.isConnected)btn.disabled=false;}
}
// Only a finished, dialed attempt may automatically open a questionnaire.
window.steadyHandsOpenPostCallQuestionnaire = function(detail){
 const d=detail||{};
 if(!d.crm_id||d.called!==true||!d.attempt_id||!Number.isFinite(d.finished_at)||d.finished_at<=0)return false;
 if((regularActive&&d.call_method!=='regular')||window.SteadyHandsTwilioVoice?.isActive?.())return false;
 if(d.call_method==='regular')regularActive=false;
 const identity=(d.call_method||'regular')+':'+d.attempt_id;
 if(seen.has(identity))return true;
 try {
   captureAnswers();
   pending={...d,company:d.company||q('#refCompany')?.textContent||'Prospect',
     event_id:typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():
       '00000000-0000-4000-8000-'+Math.random().toString(16).slice(2).padEnd(12,'0').slice(0,12)};
   storeDraft(pending);
   view();
   seen.add(identity);persist();renderDrafts();
   return true;
 } catch(err){console.error('Unable to open post-call questionnaire',err);return false;}
};
window.addEventListener('steadyhands:regular-phone-finished',e=>window.steadyHandsOpenPostCallQuestionnaire(e.detail));
window.addEventListener('steadyhands:voice-state',e=>{if(['preparing','calling'].includes(e.detail?.state))hideActive();});
window.addEventListener('steadyhands:regular-call-state',e=>{regularActive=!!e.detail?.active;if(regularActive)hideActive();});
window.addEventListener('steadyhands:start-call-request',hideActive);
window.addEventListener('steadyhands:call-lead-ready',()=>{if(pending&&window.steadyHandsCallLead?.id!==pending.crm_id)hideActive();});
window.addEventListener('pagehide',captureAnswers);
function init(){persist();renderDrafts();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
