(() => {
  'use strict';
  function open(action,trigger) {
    const lead=window.steadyHandsCallLead;
    if (!lead?.id || document.getElementById('leadActionDialog')) return;
    const dnc=action==='dnc';
    const dialog=document.createElement('dialog');dialog.id='leadActionDialog';dialog.className='lead-action-dialog';
    dialog.setAttribute('aria-labelledby','leadActionTitle');
    dialog.innerHTML=`<form><h2 id="leadActionTitle">${dnc?'Mark Do Not Call?':'Send warm lead to development'}</h2><p id="leadActionCompany"></p><p>${dnc?'This marks the lead Do Not Call and blocks future calls through Outreach. Confirm only if the prospect should no longer be contacted.':'Send this lead to the Development Team for review. It will be tagged Warm Lead and Development Team in the CRM.'}</p><label for="leadActionNote">${dnc?'Reason (optional)':'Handoff notes'}<textarea id="leadActionNote" maxlength="4000" rows="4" ${dnc?'':'required'} placeholder="${dnc?'What did the prospect request?':'What does the client need, and what should development follow up on?'}"></textarea></label><p id="leadActionStatus" role="status" aria-live="polite"></p><footer><button type="button" id="leadActionCancel">Cancel</button><button type="submit" class="${dnc?'danger':'primary'}">${dnc?'Confirm Do Not Call':'Send to Development →'}</button></footer></form>`;
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
        if(dnc)window.SteadyHandsTwilioVoice?.hangup();
        const message=document.getElementById('refMessage');
        if(message)message.textContent=dnc?'Saved: DO NOT CALL. Further Outreach calls are blocked.':'Sent to Development Team for review as a warm lead.';
        trigger.textContent=dnc?'DO NOT CALL — SAVED':'Sent to Development ✓';trigger.disabled=true;
        dialog.close();
      } catch(error) {status.textContent='Not saved: '+error.message;saving=false;buttons.forEach(b=>b.disabled=false);}
    };
    dialog.showModal();dialog.querySelector('#leadActionCancel').focus();
  }
  document.getElementById('refDoNotCall')?.addEventListener('click',event=>open('dnc',event.currentTarget));
  document.getElementById('refSendTo')?.addEventListener('click',event=>open('development',event.currentTarget));
})();
