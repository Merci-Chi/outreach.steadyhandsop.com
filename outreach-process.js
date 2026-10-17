/* Per-account, per-lead call checklist; development handoff uses the shared CRM action. */
(() => {
  'use strict';
  const panel = document.querySelector('.outreach-process');
  if (!panel) return;
  const $ = selector => panel.querySelector(selector);
  const selectedId = () => document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId || '';
  const checks = [...panel.querySelectorAll('[data-process-step]')];
  let userId = '', leadId = '', state = {}, busy = false, revision = 0;
  const key = id => `steadyhands-process-v1:${userId}:${id}`;
  const feedback = text => { $('#processFeedback').textContent = text; };
  function persist(id = leadId, value = state) {
    if (!userId || !id) return;
    try { localStorage.setItem(key(id), JSON.stringify(value)); }
    catch { feedback('Progress could not be saved in this browser.'); }
  }
  function render() {
    checks.forEach((input, i) => {
      input.checked = !!state.steps?.[i];
      input.closest('li').classList.toggle('is-complete', input.checked);
    });
    $('#processProgress').textContent = `${checks.filter(input => input.checked).length} / 6`;
    $('#processPhone').value = state.phone || '';
    $('#processNotes').value = state.notes || '';
    $('#processSend').disabled = busy || !!state.sent;
    $('#processSend').textContent = state.sent ? 'Sent to development team' : 'Send to development team';
    $('#processDevelopment').textContent = state.status || 'Not sent to development yet.';
    // Handoff is completed by a successful CRM write, never by a manual check.
    checks[4].disabled = true;
  }
  async function authenticate() {
    const client = window.steadyHandsCRMClient;
    if (!client) throw Error('Please sign in and reload the page.');
    const {data, error} = await client.auth.getUser();
    if (error || !data?.user) throw Error('Please sign in again.');
    return data.user.id;
  }
  async function checkStatus(id = leadId) {
    if (!id) return;
    const requestRevision = revision;
    $('#processStatus').disabled = true;
    try {
      const {data: row, error} = await window.steadyHandsCRMClient.from('crm')
        .select('id,stage,outcome,tags,assigned_user_id').eq('id', id).single();
      if (error || !row) throw Error('Could not load development status. Try again.');
      if (row.assigned_user_id !== userId) throw Error('This lead is not assigned to your account.');
      if (requestRevision !== revision || id !== leadId) return;
      const sent = (row.tags || []).includes('Development Team');
      state.sent = sent;
      state.steps[4] = sent;
      state.status = sent ? `CRM status: ${row.stage || 'review'}${row.outcome ? ' · ' + row.outcome : ''}` : 'Not sent to development yet.';
      persist(); render();
      feedback('Latest CRM status checked.');
    } catch (error) {
      if (requestRevision === revision) feedback(error.message);
    } finally {
      if (requestRevision === revision) $('#processStatus').disabled = false;
    }
  }
  async function syncLead() {
    const id = selectedId();
    if (id === leadId && userId) return;
    const requestRevision = ++revision;
    leadId = id; state = {steps: []};
    $('#processSteps').disabled = true;
    $('#processLead').textContent = id ? 'Loading selected prospect…' : 'Select a prospect to begin.';
    feedback(''); render();
    if (!id) return;
    try {
      const account = await authenticate();
      if (requestRevision !== revision) return;
      userId = account;
      try { state = JSON.parse(localStorage.getItem(key(id))) || {steps: []}; } catch { state = {steps: []}; }
      if (!Array.isArray(state.steps)) state.steps = [];
      $('#processLead').textContent = document.querySelector('#refCompany')?.textContent || 'Selected prospect';
      $('#processSteps').disabled = false;
      $('#processStatus').disabled = false;
      render(); await checkStatus(id);
    } catch (error) { if (requestRevision === revision) feedback(error.message); }
  }
  checks.forEach((input, i) => input.addEventListener('change', () => {
    if (i === 2 && input.checked && !validPhone()) {
      input.checked = false; feedback('Enter the confirmed textable number first.'); return;
    }
    state.steps[i] = input.checked; persist(); render();
  }));
  function validPhone() {
    const digits = $('#processPhone').value.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }
  $('#processPhone').addEventListener('input', () => {
    state.phone = $('#processPhone').value;
    if (!validPhone()) { state.steps[2] = false; checks[2].checked = false; }
    persist(); $('#processProgress').textContent = `${checks.filter(input => input.checked).length} / 6`;
  });
  $('#processNotes').addEventListener('input', () => { state.notes = $('#processNotes').value; persist(); });
  $('#processSend').addEventListener('click', async () => {
    if (busy || !leadId || selectedId() !== leadId) return;
    if (!validPhone() || ![0, 1, 2, 3].every(i => state.steps[i])) {
      feedback('Complete steps 1–4 and confirm a textable number before sending.'); return;
    }
    if (!state.notes?.trim()) { feedback('Add the lead’s business needs for the development team.'); $('#processNotes').focus(); return; }
    const id = leadId, snapshot = {...state, steps: [...state.steps]};
    busy = true; render(); feedback('Sending to development team…');
    try {
      await window.SteadyHandsLeadDisposition.save(id, 'development', `Textable number: ${snapshot.phone.trim()}. Business needs: ${snapshot.notes.trim()}`);
      snapshot.sent = true; snapshot.steps[4] = true; snapshot.status = 'Awaiting development team · CRM status: review';
      persist(id, snapshot);
      if (leadId === id) { state = snapshot; feedback('Sent to development team. Use the status button to check for updates.'); }
    } catch (error) { if (leadId === id) feedback('Not sent: ' + error.message); }
    finally { busy = false; render(); }
  });
  $('#processStatus').addEventListener('click', () => checkStatus());
  const selected = document.querySelector('#selectedLeadTop');
  if (selected) new MutationObserver(syncLead).observe(selected, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-crm-id']});
  window.addEventListener('storage', event => { if (leadId && event.key === key(leadId)) { leadId = ''; syncLead(); } });
  window.addEventListener('focus', () => { if (leadId && userId) checkStatus(); });
  syncLead();
})();
