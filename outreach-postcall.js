/* Manual regular-phone post-call questionnaire; time is not verified network call duration. */
(()=>{'use strict';
const q=(s,r=document)=>r.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage='steadyhands:outreach-feedback-pending-v2';let pending=null,submitting=false;
try{pending=JSON.parse(sessionStorage.getItem(storage)||'null')}catch{}
const client=()=>window.steadyHandsCRMClient;
function view(){
 let overlay=q('#shFeedbackOverlay');if(!overlay){overlay=document.createElement('div');overlay.id='shFeedbackOverlay';overlay.className='sh-tool-mask';document.body.append(overlay);}
 if(!pending){overlay.remove();return;}
 overlay.innerHTML=`<section class="sh-tool-sheet" role="dialog" aria-modal="true" aria-labelledby="shFeedbackTitle"><div class="sh-sheet-handle"></div><div class="sh-sheet-head"><h2 id="shFeedbackTitle">How did it go?</h2><button type="button" class="sh-sheet-x" id="shFeedbackLater" aria-label="Close">×</button></div><form class="sh-sheet-body" id="shFeedbackForm"><p class="sh-sheet-help">${esc(pending.company||'Prospect')} · Regular Phone · Manual call record</p><label class="sh-field-label">Outcome<select class="sh-sheet-input" name="outcome" required><option value="called" ${pending.called?'selected':''}>Called</option><option value="follow_up">Follow Up</option><option value="not_interested">Not Interested</option><option value="did_not_call" ${!pending.called?'selected':''}>Didn't Call</option></select></label><fieldset class="sh-feedback-interest"><legend>Follow-up details (optional)</legend>${['Interested','Skeptical','Needs More Info','Later','Money Problems'].map(v=>`<label><input type="checkbox" name="interest" value="${v}"> ${v}</label>`).join('')}</fieldset><div class="sh-feedback-flags">${[['portal_link_sent','Client portal link sent'],['registered','Client registered'],['site_reviewed','Client reviewed site'],['ready_to_buy','Ready to buy']].map(([n,label])=>`<label><input type="checkbox" name="${n}"> ${label}</label>`).join('')}</div><label class="sh-field-label">Notes<textarea class="sh-note-input" name="notes" placeholder="What happened during this call?"></textarea></label><button class="sh-sheet-primary" type="submit" id="shFeedbackSave">Save Call Result</button><p class="sh-sheet-status" id="shFeedbackStatus" role="status"></p></form></section>`;
 q('#shFeedbackLater',overlay).onclick=()=>{overlay.remove();};
 q('#shFeedbackForm',overlay).onsubmit=save;
}
async function save(e){e.preventDefault();if(!pending||submitting)return;const c=client(),f=e.currentTarget,btn=q('#shFeedbackSave'),message=q('#shFeedbackStatus');if(!c){message.textContent='Sign in before saving.';return;}submitting=true;btn.disabled=true;
 try{const d=new FormData(f);const args={p_crm_id:pending.crm_id,p_client_event_id:pending.event_id,p_outcome:String(d.get('outcome')),p_elapsed_seconds:Math.max(0,Math.min(86400,Number(pending.elapsed_seconds)||0)),p_interest_stages:d.getAll('interest'),p_notes:String(d.get('notes')||''),p_portal_link_sent:d.has('portal_link_sent'),p_registered:d.has('registered'),p_site_reviewed:d.has('site_reviewed'),p_ready_to_buy:d.has('ready_to_buy')};const {error}=await c.rpc('record_regular_outreach_call_v1',args);if(error)throw error;sessionStorage.removeItem(storage);pending=null;message.textContent='Saved to Supabase.';setTimeout(()=>{q('#shFeedbackOverlay')?.remove();window.dispatchEvent(new CustomEvent('steadyhands:activity-updated'));},400);
 }catch(ex){console.error('Questionnaire save failed:',ex);message.textContent=`Not saved: ${ex.message||'Try again'}. Your answers are still here.`;}
 finally{submitting=false;if(btn?.isConnected)btn.disabled=false;}
}
// Direct API for the Finish Call button. Keeping the event listener supports older callers.
window.steadyHandsOpenPostCallQuestionnaire = function(detail){
 const d=detail||{};
 if(!d.crm_id)return false;
 try {
   const previous=pending;
   pending={...d,company:d.company||q('#refCompany')?.textContent||'Prospect',
     event_id:previous?.crm_id===d.crm_id ? previous.event_id :
       (typeof crypto!=='undefined' && typeof crypto.randomUUID==='function' ? crypto.randomUUID() :
        '00000000-0000-4000-8000-'+Math.random().toString(16).slice(2).padEnd(12,'0').slice(0,12))};
   sessionStorage.setItem(storage,JSON.stringify(pending));
   view();
   return true;
 } catch(err){console.error('Unable to open post-call questionnaire',err);return false;}
};
window.addEventListener('steadyhands:regular-phone-finished',e=>{const d=e.detail||{};if(!d.crm_id)return;window.steadyHandsOpenPostCallQuestionnaire(d)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(pending)view()});else if(pending)view();
})();