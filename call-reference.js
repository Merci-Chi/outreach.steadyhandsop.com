(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const storageKey = 'steadyhands-outreach-call-handoff';
  const incomingId = params.get('crm_id') || '';
  let snapshot = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved && saved.id === incomingId) snapshot = saved;
  } catch (_) {}
  // Explicit URL data is authoritative, then the matching Outreach snapshot.
  const lead = {
    id: incomingId,
    company: params.get('company') || snapshot?.company || '',
    number: params.get('number') || snapshot?.number || '',
    timezone: params.get('timezone') || snapshot?.timezone || '',
    contact: params.get('contact') || snapshot?.contact || ''
  };
  const valid = !!lead.id && lead.number.replace(/\D/g,'').length >= 10;
  function zone() {
    return window.callcenterLeadZone(lead.number, lead.timezone).zone;
  }
  function clock() {
    const el = $('#refLocalTime'); if (!el) return;
    const tz = zone();
    if (!tz) { el.textContent = 'Local time unavailable'; return; }
    try { el.textContent = new Intl.DateTimeFormat('en-US', { timeZone:tz, weekday:'long',hour:'numeric',minute:'2-digit',timeZoneName:'short' }).format(new Date()); }
    catch (_) { el.textContent = 'Local time unavailable'; }
  }
  function callingWindow() {
    const tz = zone();
    if (!tz) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23'
      }).formatToParts(new Date());
      const day = parts.find(x => x.type === 'weekday')?.value;
      const hour = Number(parts.find(x => x.type === 'hour')?.value);
      return ['Mon','Tue','Wed','Thu','Fri'].includes(day) && hour >= 9 && hour < 17;
    } catch (_) { return null; }
  }
  function render() {
    const name = $('#refCompany'), phone = $('#refPhone'), status = $('#refStatus');
    if (name) name.textContent = lead.company || (incomingId ? 'Prospect' : 'No prospect selected');
    if (phone) phone.textContent = valid ? lead.number : 'No phone number on file';
    const hours = valid ? callingWindow() : null;
    if (status && !window.SteadyHandsTwilioVoice?.isActive()) status.textContent = !valid ? 'No phone number on file' : hours === true ? 'Ready to call' : hours === false ? 'Outside of recommended calling hours' : 'Calling hours unavailable';
    const dot = document.querySelector('.ref-lead-card .ref-green-dot');
    if (dot) {
      dot.classList.toggle('ref-status-outside', valid && hours === false);
      dot.classList.toggle('ref-status-neutral', !valid || hours === null);
    }
    clock();
    const button = $('#refEndCall');
    if (button && button.dataset.callState !== 'active') button.disabled = !valid;
    window.steadyHandsCallLead = { ...lead };
    window.dispatchEvent(new Event('steadyhands:call-lead-ready'));
  }
  // Always present the transferred prospect; never replace it with another CRM card.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
  setInterval(render, 30000);
})();
