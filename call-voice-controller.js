(() => {
  'use strict';
  let starting = false;
  const message = text => { const el = document.getElementById('refMessage'); if (el) el.textContent = text; };
  const state = (active, callSid) => window.dispatchEvent(new CustomEvent('steadyhands:call-state', {detail:{active,callSid}}));
  const button = () => document.getElementById('refEndCall');
  window.addEventListener('steadyhands:start-call-request', async () => {
    if (starting || window.SteadyHandsTwilioVoice?.isActive()) return;
    starting = true;
    if (button()) button().disabled = true;
    try {
      const lead = window.steadyHandsCallLead;
      if (!lead?.id || !lead.number) throw new Error('Select a prospect with a phone number first.');
      const caller = await window.SteadyHandsApprovedCaller();
      if (!caller) throw new Error('No approved calling number is assigned. Ask your administrator to assign an enabled Twilio Ready number.');
      if(typeof window.SteadyHandsReviewBeforeCall!=='function')throw Error('Prospect review is still loading. Please try again.');
      if(!await window.SteadyHandsReviewBeforeCall(lead.id))return;
      if(window.steadyHandsCallLead?.id!==lead.id)throw Error('The prospect changed. Review the new prospect first.');
      const voice = window.SteadyHandsTwilioVoice;
      if (!voice) throw new Error('The browser phone is still loading. Please try again.');
      message('Calling from ' + caller.phone_number + '…');
      // The authenticated Twilio backend remains responsible for resolving and
      // validating the assigned caller ID. Never accept a caller-supplied From.
      await voice.start(lead.number, {crmId:lead.id,company:lead.company,transcribe:true});
      state(true);
    } catch (error) {
      state(false);
      message(error.message || 'The call could not be started.');
    } finally {
      starting = false;
      if (button()) button().disabled = false;
    }
  });
  window.addEventListener('steadyhands:end-call-request', () => window.SteadyHandsTwilioVoice?.hangup());
  window.addEventListener('steadyhands:voice-state', event => {
    const detail = event.detail || {};
    if (['calling','ringing','connected'].includes(detail.state)) state(true,detail.callSid);
    if (detail.state === 'connected') message('Call connected.');
    if (detail.state === 'preparing') message(detail.message || 'Preparing browser calling…');
    if (detail.state === 'ended') {
      state(false);
      if (detail.reason !== 'error') message('Call ended.');
    }
    if (detail.state === 'error') {
      state(false);
      message((detail.code ? 'Calling error ' + detail.code + ': ' : '') + (detail.message || 'The call failed.'));
    }
  });
  document.getElementById('refMute')?.addEventListener('click', event => {
    const voice = window.SteadyHandsTwilioVoice;
    if (!voice?.isActive()) return;
    const btn = event.currentTarget;
    const muted = voice.setMuted(btn.getAttribute('aria-pressed') !== 'true');
    btn.setAttribute('aria-pressed', String(muted));
  });
  document.getElementById('refHold')?.addEventListener('click', async event => {
    const voice = window.SteadyHandsTwilioVoice;
    if (!voice?.isActive()) return;
    const btn = event.currentTarget;
    try { btn.setAttribute('aria-pressed', String(await voice.setHeld(!voice.isHeld()))); }
    catch (error) { message(error.message); }
  });
  document.getElementById('refSpeaker')?.addEventListener('click', async () => {
    try {
      const result = await window.SteadyHandsTwilioVoice?.toggleSpeakerOutput();
      message(result?.supported ? 'Audio output: ' + result.label : 'Use your device audio controls to select the speaker.');
    } catch (error) { message(error.message); }
  });
})();
