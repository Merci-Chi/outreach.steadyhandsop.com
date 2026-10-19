/* Read existing call records for the selected Performance account. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleString() : 'Not captured';
  const field = (label,value) => `<div><dt>${label}</dt><dd>${esc(value || 'Not captured')}</dd></div>`;
  let closeCurrent = null;
  window.steadyHandsOpenPerformanceCall = async ({client,activityId,userId,trigger}) => {
    closeCurrent?.();
    const overlay = document.createElement('div');
    overlay.className = 'activity-transcript-overlay';
    overlay.innerHTML = `<section class="activity-transcript-sheet performance-call-sheet" role="dialog" aria-modal="true" aria-labelledby="performanceCallTitle" tabindex="-1"><header class="activity-transcript-head"><div><span>Call Details</span><strong id="performanceCallTitle">Loading call…</strong></div><button type="button" class="activity-transcript-close" aria-label="Close call details">×</button></header><div class="performance-call-body" role="status">Loading saved call details…</div></section>`;
    const body = overlay.querySelector('.performance-call-body');
    const sheet = overlay.querySelector('[role="dialog"]');
    const close = () => { overlay.remove(); document.removeEventListener('keydown',onKey); closeCurrent = null; if(trigger?.isConnected)trigger.focus(); };
    const onKey = event => {
      if(event.key === 'Escape')close();
      if(event.key === 'Tab') { event.preventDefault(); overlay.querySelector('.activity-transcript-close').focus(); }
    };
    overlay.querySelector('.activity-transcript-close').addEventListener('click',close);
    overlay.addEventListener('click',event => {if(event.target === overlay)close();});
    document.addEventListener('keydown',onKey);
    closeCurrent = close;
    document.body.appendChild(overlay);
    sheet.focus();
    try {
      const {data:call,error} = await client.from('callcenter_call_activity')
        .select('id,user_id,crm_id,duration_seconds,outcome,call_sid,caller_id_used,connected_at,ended_at,created_at')
        .eq('id',activityId).eq('user_id',userId).maybeSingle();
      if(error)throw error;
      if(!call)throw new Error('This call is unavailable for this account.');
      const [leadResult,transcriptResult] = await Promise.all([
        call.crm_id ? client.from('crm').select('id,company,name,phone,notes,stage').eq('id',call.crm_id).maybeSingle() : Promise.resolve({data:null}),
        client.from('callcenter_transcripts').select('id,call_activity_id,company,phone,transcript,segments,started_at,ended_at,created_at')
          .eq('call_activity_id',call.id).eq('user_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle()
      ]);
      const lead = leadResult.data || {}, transcript = transcriptResult.data;
      if(!overlay.isConnected)return;
      overlay.querySelector('#performanceCallTitle').textContent = lead.company || lead.name || transcript?.company || 'Call Details';
      const segments = Array.isArray(transcript?.segments) ? transcript.segments.filter(s => s && String(s.text || '').trim()) : [];
      const conversation = segments.length ? segments.map(s => `<div class="performance-call-line ${s.speaker === 'customer' ? 'customer' : 'agent'}"><strong>${s.speaker === 'customer' ? 'Customer' : s.speaker === 'agent' ? 'You' : 'Speaker'}</strong><p>${esc(s.text)}</p></div>`).join('') : `<p class="performance-call-plain">${esc(transcript?.transcript || 'No transcript was saved for this call.')}</p>`;
      const seconds = Math.max(0,Number(call.duration_seconds)||0);
      body.removeAttribute('role');
      body.innerHTML = `<dl class="performance-call-fields">${field('Outcome',call.outcome)}${field('Phone',lead.phone || transcript?.phone)}${field('Duration',Math.floor(seconds/60)+'m '+Math.floor(seconds%60)+'s')}${field('Recorded',date(call.created_at))}${field('Caller ID used',call.caller_id_used)}${field('Connected',date(call.connected_at || transcript?.started_at))}${field('Ended',date(call.ended_at || transcript?.ended_at))}${field('Stage',lead.stage)}</dl><h3>Conversation</h3><div class="performance-call-conversation">${transcriptResult.error ? '<p role="alert">Unable to load the transcript. Close and reopen these details to retry.</p>' : conversation}</div><h3>Notes</h3><p class="performance-call-plain">${esc(leadResult.error ? 'Unable to load lead notes.' : lead.notes || 'No lead notes.')}</p><h3>Call identifiers</h3><dl class="performance-call-fields performance-call-identifiers">${field('Activity ID',call.id)}${field('Transcript ID',transcript?.id || 'Not available')}${field('Twilio CallSid',call.call_sid)}</dl>`;
    } catch(error) {
      if(overlay.isConnected)body.innerHTML = `<p role="alert">${esc(error.message || 'Unable to load call details. Close and reopen to retry.')}</p>`;
    }
  };
})();
