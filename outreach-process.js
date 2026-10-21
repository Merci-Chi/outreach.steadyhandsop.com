/* CRM is the only checkbox authority. Browser storage contains drafts, never checks. */
(() => {
  'use strict';
  const panel=document.querySelector('.outreach-process');if(!panel)return;
  const $=selector=>panel.querySelector(selector);
  const selectedId=()=>window.steadyHandsCallLead?.id||document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId||'';
  const checks=[...panel.querySelectorAll('[data-process-step]')];
  const empty=()=>({steps:Array(6).fill(false),versions:Array(6).fill(0),phone:'',notes:'',sent:false});
  let userId='',leadId='',state=empty(),busy=false,ready=false,revision=0,request=0,retryTimer=null,retryDelay=200;
  const client=()=>window.steadyHandsCRMClient;
  const draftKey=id=>`steadyhands-process-draft-v2:${userId}:${id}`;
  const feedback=text=>{$('#processFeedback').textContent=text;};
  function persistDraft() {
    if(!userId||!leadId)return;
    try{localStorage.setItem(draftKey(leadId),JSON.stringify({phone:state.phone,notes:state.notes}));}
    catch{feedback('The draft could not be saved in this browser. Checkbox history remains in CRM.');}
  }
  function render() {
    checks.forEach((input,i)=>{
      input.checked=state.steps[i]===true;
      input.disabled=false;
      input.closest('li').classList.toggle('is-complete',input.checked);
    });
    $('#processSteps').disabled=!ready||busy;
    $('#processStatus').disabled=busy||!ready||!leadId;
    $('#processProgress').textContent=`${state.steps.filter(Boolean).length} / 6`;
    $('#processPhone').value=state.phone||'';
    $('#processNotes').value=state.notes||'';
    $('#processSend').disabled=!ready||busy||state.sent;
    $('#processSend').textContent=state.sent?'Sent to development team':'Send to development team';
    $('#processDevelopment').textContent=state.status||'Development status has not been checked.';
  }
  function retry(rev,error) {
    if(rev!==revision)return;
    feedback('Loading…');
    if(error)console.warn('Process checklist read will retry:',error);
    clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>syncLead(true),retryDelay);
    retryDelay=Math.min(retryDelay*2,5000);
  }
  async function reload(id=leadId) {
    if(!id||busy)return;
    const rev=revision,seq=++request;
    $('#processStatus').disabled=true;
    try {
      const [leadResult,checkResult]=await Promise.all([
        client().from('crm').select('id,stage,outcome,tags,assigned_user_id').eq('id',id).single(),
        client().from('outreach_process_checks').select('step_no,is_checked,version,changed_by,changed_at').eq('crm_id',id)
      ]);
      if(leadResult.error||!leadResult.data)throw leadResult.error||Error('Unable to check this prospect.');
      if(String(leadResult.data.assigned_user_id)!==String(userId))throw Error('This prospect is not assigned to your account.');
      if(checkResult.error)throw checkResult.error;
      if(rev!==revision||seq!==request||id!==leadId)return;
      state.steps=Array(6).fill(false);state.versions=Array(6).fill(0);
      for(const row of checkResult.data||[]) {
        const index=Number(row.step_no)-1;
        if(index>=0&&index<6){state.steps[index]=row.is_checked===true;state.versions[index]=Number(row.version)||0;}
      }
      // Development status is separate from manual completion of step five.
      const row=leadResult.data;
      state.sent=(row.tags||[]).includes('Development Team');
      state.status=state.sent?`CRM status: ${row.stage||'review'}${row.outcome?' · '+row.outcome:''}`:'Not sent to development yet.';
      ready=true;retryDelay=200;clearTimeout(retryTimer);render();feedback('');
      return true;
    } catch(error) {
      if(rev===revision&&seq===request){ready=false;render();retry(rev,error);}
    } finally {if(rev===revision&&seq===request)$('#processStatus').disabled=!ready;}
  }
  async function syncLead(force=false) {
    const id=selectedId();if(!force&&id===leadId&&ready)return;
    clearTimeout(retryTimer);
    const rev=++revision;++request;leadId=id;state=empty();ready=false;busy=false;
    $('#processLead').textContent=id?'Loading selected prospect…':'Select a prospect to begin.';feedback('');render();
    if(!id)return;
    feedback('Loading…');
    // Deferred scripts can run before auth-guard creates the shared CRM client.
    // Wait for it instead of treating normal startup as a sign-in failure.
    if(!client()){retry(rev);return;}
    try {
      const {data,error}=await client().auth.getSession();
      if(rev!==revision)return;
      if(error||!data?.session?.user){retry(rev,error);return;}
      userId=data.session.user.id;
      // Intentionally ignore all legacy steadyhands-process-v1 checkboxes.
      try{const draft=JSON.parse(localStorage.getItem(draftKey(id))||'{}');state.phone=typeof draft.phone==='string'?draft.phone:'';state.notes=typeof draft.notes==='string'?draft.notes:'';}catch{}
      $('#processLead').textContent=document.querySelector('#refCompany')?.textContent||'Selected prospect';
      await reload(id);
    }catch(error){retry(rev,error);}
  }
  const validPhone=()=>{const digits=$('#processPhone').value.replace(/\D/g,'');return digits.length>=10&&digits.length<=15;};
  checks.forEach((input,i)=>input.addEventListener('change',async()=>{
    const checked=input.checked;input.checked=state.steps[i];
    if(!ready||busy||selectedId()!==leadId)return;
    if(i===2&&checked&&!validPhone()){feedback('Enter the confirmed textable number first.');return;}
    const id=leadId,rev=revision;++request;busy=true;render();feedback('Saving manual checkbox change to CRM…');
    let failed=false;
    try {
      const {data,error}=await client().rpc('set_outreach_process_check',{
        p_crm_id:String(id),p_step_no:i+1,p_is_checked:checked,p_expected_version:state.versions[i]
      });
      if(error)throw error;
      const saved=Array.isArray(data)?data[0]:data;
      if(!saved||Number(saved.step_no)!==i+1||saved.is_checked!==checked)throw Error('CRM did not confirm the checkbox change.');
      if(rev!==revision||id!==leadId)return;
      state.steps[i]=saved.is_checked;state.versions[i]=Number(saved.version);
      feedback('Manual checkbox change saved to CRM.');
    }catch(error){failed=true;if(rev===revision)feedback('Checkbox not saved: '+(error.message||'Try again.'));}
    finally {
      if(rev===revision){busy=false;render();if(failed){const prior=$('#processFeedback').textContent;await reload();feedback(prior+' Latest CRM values have been requested; check again manually.');}}
    }
  }));
  $('#processPhone').addEventListener('input',()=>{state.phone=$('#processPhone').value;persistDraft();});
  $('#processNotes').addEventListener('input',()=>{state.notes=$('#processNotes').value;persistDraft();});
  $('#processSend').addEventListener('click',async()=>{
    if(!ready||busy||!leadId||selectedId()!==leadId)return;
    if(!validPhone()||![0,1,2,3].every(i=>state.steps[i])){feedback('Manually complete steps 1–4 and confirm a textable number before sending.');return;}
    if(!state.notes.trim()){feedback('Add the lead’s business needs for the development team.');$('#processNotes').focus();return;}
    const id=leadId,rev=revision;++request;busy=true;render();feedback('Sending to development team…');
    try {
      await window.SteadyHandsLeadDisposition.save(id,'development',`Textable number: ${state.phone.trim()}. Business needs: ${state.notes.trim()}`);
      const {data:leadData,error:leadError}=await client().from('crm').select('id,company_name').eq('id',id).single();
      // Persist the inbox record even when a CRM display name is unavailable.
      if(leadError && leadError.code!=='42703')console.warn('Development lead name unavailable:',leadError);
      const {error:requestError}=await client().from('development_requests').insert({
        crm_id:String(id),submitted_by:userId,
        company_name:leadData?.company_name||document.querySelector('#refCompany')?.textContent||null,
        phone:state.phone.trim(),business_needs:state.notes.trim()
      });
      if(requestError)throw new Error('CRM handoff saved, but development inbox delivery failed: '+requestError.message+'. Contact your administrator.');
      if(rev===revision){state.sent=true;state.status='Awaiting development team · CRM status: review';feedback('Sent to development team. Manually check step 5 to record completion.');}
    }catch(error){if(rev===revision)feedback('Not sent: '+error.message);}
    finally{if(rev===revision){busy=false;render();}}
  });
  $('#processStatus').addEventListener('click',()=>reload());
  const selected=document.querySelector('#selectedLeadTop');
  if(selected)new MutationObserver(()=>{if(selectedId()!==leadId)syncLead();}).observe(selected,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crm-id']});
  window.addEventListener('steadyhands:call-lead-ready',()=>{if(selectedId()!==leadId)syncLead();});
  window.addEventListener('focus',()=>{if(leadId&&!busy)syncLead(true);});
  document.addEventListener('DOMContentLoaded',()=>{if(!ready)syncLead();},{once:true});
  syncLead();
})();
