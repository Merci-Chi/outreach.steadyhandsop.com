(() => {
  'use strict';
  const button = document.getElementById('refEndCall');
  const label = document.getElementById('refPhoneActionLabel');
  if (!button || !label) return;

  function hasLead() {
    const card = document.querySelector('#selectedLeadTop .lead-card');
    return Boolean(window.steadyHandsCallLead?.id && String(window.steadyHandsCallLead.number || '').replace(/\D/g, '').length >= 10) || Boolean(card && card.dataset.crmId);
  }

  function update(active) {
    const connected = Boolean(active);
    button.classList.toggle('is-active', connected);
    button.classList.toggle('is-idle', !connected);
    button.dataset.callState = connected ? 'active' : 'idle';
    button.setAttribute('aria-label', connected ? 'End Call' : 'Call');
    label.textContent = connected ? 'End Call' : 'Call';
    button.disabled = !connected && !hasLead();
  }

  window.addEventListener('steadyhands:call-state', event => update(event.detail?.active));

  // Prospect arrives directly through the call handoff; no DOM-wide observer needed.
  button.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent(button.dataset.callState === 'active' ? 'steadyhands:end-call-request' : 'steadyhands:start-call-request'));
  });

  update(false);
  window.addEventListener('steadyhands:call-lead-ready', () => update(false));
})();
