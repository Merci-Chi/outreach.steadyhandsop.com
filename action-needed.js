(() => {
  'use strict';
  async function init() {
    const main=document.getElementById('action-list');
    try {
      const {assignment,associate}=await window.OutreachActions.load();
      let content;
      if (!assignment) content='<p>You have no actions assigned right now.</p>';
      else if (assignment.status==='completed') content='<div class="notice"><h2>Preferences completed</h2><p>Your questionnaire has been submitted. Your administrator can review your response.</p></div>';
      else {
        content=`<p>Please complete your assigned questionnaire.</p><button type="button" class="button" id="open-questionnaire">Open questionnaire</button>`;
      }
      main.innerHTML='<p class="eyebrow">YOUR WORKSPACE</p><h1>Action Needed</h1>'+content+'<div class="actions"><a class="button" href="index.html">Back to Outreach</a></div>';
      const openButton=document.getElementById('open-questionnaire');
      const open=async()=>{try{await window.OutreachQuestionnaire.open({onComplete:init});}catch(error){const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;main.appendChild(message);}};
      if(openButton){openButton.addEventListener('click',open);if(new URLSearchParams(location.search).get('open')==='1')open();}
    } catch {
      main.innerHTML='<p class="eyebrow">YOUR WORKSPACE</p><h1>Action Needed</h1><p role="alert">We couldn’t load your actions. Please try again or contact your administrator.</p><div class="actions"><button id="retry-actions">Try again</button><a class="button" href="index.html">Back to Outreach</a></div>';
      document.getElementById('retry-actions').addEventListener('click',init);
    }
  }
  document.addEventListener('DOMContentLoaded',init);
})();
