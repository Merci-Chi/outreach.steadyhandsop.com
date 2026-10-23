(() => {
  'use strict';
  function open(action,trigger) {
    const lead=window.steadyHandsCallLead || {id:document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId,company:document.getElementById('refCompany')?.textContent};
    if (!lead?.id || document.getElementById('leadActionDialog')) return;
    const dnc=action==='dnc',wrong=action==='wrong_number';
    const dialog=document.createElement('dialog');dialog.id='leadActionDialog';dialog.className='lead-action-dialog';
    dialog.setAttribute('aria-labelledby','leadActionTitle');
    dialog.innerHTML=`<form><h2 id="leadActionTitle">${dnc?'Mark Do Not Call?':wrong?'Mark Wrong Number?':'Send warm lead to development'}</h2><p id="leadActionCompany"></p><p>${dnc?'This marks the lead Do Not Call and blocks future calls through Outreach. Confirm only if the prospect should no longer be contacted.':wrong?'Tag this prospect Wrong Number and prevent future Outreach calls to this lead. Use only when the saved number is incorrect.':'Send this lead to the Development Team for review. It will be tagged Warm Lead and Development Team in the CRM.'}</p><label for="leadActionNote">${dnc||wrong?'Reason (optional)':'Handoff notes'}<textarea id="leadActionNote" maxlength="4000" rows="4" ${dnc||wrong?'':'required'} placeholder="${dnc?'What did the prospect request?':wrong?'What confirmed that this number is incorrect?':'What does the client need, and what should development follow up on?'}"></textarea></label><p id="leadActionStatus" role="status" aria-live="polite"></p><footer><button type="button" id="leadActionCancel">Cancel</button><button type="submit" class="${dnc||wrong?'danger':'primary'}">${dnc?'Confirm Do Not Call':wrong?'Confirm Wrong Number':'Send to Development →'}</button></footer></form>`;
    dialog.querySelector('#leadActionCompany').textContent=lead.company||lead.number||'Selected lead';
    document.body.append(dialog);
    let saving=false;
    dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();});
    dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
    dialog.querySelector('#leadActionCancel').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(saving)return;saving=true;
      const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      const status=dialog.querySelector('#leadActionStatus');status.textContent='Saving…';
      try {
        await window.SteadyHandsLeadDisposition.save(lead.id,action,dialog.querySelector('textarea').value);
        if(dnc||wrong)window.SteadyHandsTwilioVoice?.hangup();
        const message=document.getElementById('refMessage');
        if(message)message.textContent=dnc?'Saved: DO NOT CALL. Further Outreach calls are blocked.':wrong?'Saved: Wrong Number. Further Outreach calls to this lead are blocked.':'Sent to Development Team for review as a warm lead.';
        trigger.querySelector('span').textContent=dnc?'Do Not Call':wrong?'Wrong Number':'Sent to Development';
        trigger.setAttribute('aria-label',dnc?'Do Not Call — saved':wrong?'Wrong Number — saved':'Sent to Development — saved');trigger.disabled=true;
        dialog.close();
      } catch(error) {status.textContent='Not saved: '+error.message;saving=false;buttons.forEach(b=>b.disabled=false);}
    };
    dialog.showModal();dialog.querySelector('#leadActionCancel').focus();
  }
  document.getElementById('refWrongNumber')?.addEventListener('click',event=>open('wrong_number',event.currentTarget));
  document.getElementById('refDoNotCall')?.addEventListener('click',event=>open('dnc',event.currentTarget));
  document.getElementById('refSendTo')?.addEventListener('click',event=>open('development',event.currentTarget));
})();
