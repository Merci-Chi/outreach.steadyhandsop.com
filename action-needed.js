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
        const href=associate.current_basis==='hourly'?'currentlyonhourlywage.html':'alreadyoncommission.html';
        content=`<p>Please complete your assigned questionnaire.</p><a class="choice" href="${href}"><span><strong>Confirm your path & preferred hours →</strong><small>Review your next steps and submit your scheduling preference.</small></span></a>`;
      }
      main.innerHTML='<p class="eyebrow">YOUR WORKSPACE</p><h1>Action Needed</h1>'+content+'<div class="actions"><a class="button" href="index.html">Back to Outreach</a></div>';
    } catch {
      main.innerHTML='<p class="eyebrow">YOUR WORKSPACE</p><h1>Action Needed</h1><p role="alert">We couldn’t load your actions. Please try again or contact your administrator.</p><div class="actions"><button id="retry-actions">Try again</button><a class="button" href="index.html">Back to Outreach</a></div>';
      document.getElementById('retry-actions').addEventListener('click',init);
    }
  }
  document.addEventListener('DOMContentLoaded',init);
})();
