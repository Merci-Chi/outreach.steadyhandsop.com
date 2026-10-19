/* Required actions are completed on the team onboarding portal. */
(() => {
  document.addEventListener('DOMContentLoaded',()=>{
    const main=document.getElementById('action-list')||document.getElementById('app');
    if(main)main.innerHTML='<h1>Continue on onboarding</h1><p>Your required actions are available on the team onboarding portal. You will return to Outreach automatically after they are complete.</p><a class="button" href="https://onboard.steadyhandsop.com/">Open onboarding →</a>';
    // auth-guard preserves the current workspace and performs the authenticated redirect.
  });
})();
