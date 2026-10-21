(()=>{'use strict';
const $=s=>document.querySelector(s);
const card=()=>$('#selectedLeadTop .lead-card');
const tell=t=>{const e=$('#refMessage');if(e)e.textContent=t;};
// Stage editor opens directly from the selected prospect (no navigation to Sales Pipeline).
const pipelineStageOptions=[['called','Called'],['follow_up','Follow-up'],['portal_link_sent','Portal Link Sent'],['account_created','Account Created'],['reviewing_site','Reviewing Site'],['ready_to_buy','Ready to Buy'],['cancelled','Cancelled']];
const pipelineFollowupOptions=['Interested','Unsure','Needs More Info','Not Now','Budget Concerns'];
const safePipelineText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function openPipelineStagePopup(){
 const c=card(),crmId=c?.dataset.crmId||new URLSearchParams(location.search).get('crm_id');
 if(!crmId){tell('Select a lead first.');return;}
 const name=c?.querySelector('.lead-title h2')?.textContent?.trim()||new URLSearchParams(location.search).get('company')||document.querySelector('#refCompany')?.textContent?.trim()||'Selected prospect';
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

function wire(){document.querySelector('#refStartSale')?.addEventListener('click',openPipelineStagePopup);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
