/* Read existing call records for the selected Performance account. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleString() : 'Not captured';
  const field = (label,value) => `<div><dt>${label}</dt><dd>${esc(value || 'Not captured')}</dd></div>`;
  let closeCurrent = null;
  window.steadyHandsOpenPerformanceCall = async ({client,activityId,userId,trigger,ids=[]}) => {
    closeCurrent?.();
    ids=[...new Set(ids.filter(Boolean).map(String))];
    if(!ids.includes(String(activityId)))ids=[String(activityId)];
    let index=ids.indexOf(String(activityId));
    const overlay = document.createElement('div');
    overlay.className = 'activity-transcript-overlay';
    overlay.innerHTML = `<section class="activity-transcript-sheet performance-call-sheet" role="dialog" aria-modal="true" aria-labelledby="performanceCallTitle" tabindex="-1"><header class="activity-transcript-head"><div><span>Call Details</span><strong id="performanceCallTitle">Loading call…</strong></div><button type="button" class="activity-transcript-close" aria-label="Close call details">×</button></header><div class="performance-call-body" role="status">Loading saved call details…</div></section>`;
    const nav=document.createElement('nav');
    nav.className='performance-popup-nav';
    nav.setAttribute('aria-label','Navigate calls');
    nav.innerHTML='<button type="button" data-call-prev aria-label="Previous call">←</button><span data-call-position aria-live="polite"></span><button type="button" data-call-next aria-label="Next call">→</button>';
    overlay.querySelector('.activity-transcript-head').after(nav);
    const prev=nav.querySelector('[data-call-prev]'),next=nav.querySelector('[data-call-next]'),position=nav.querySelector('[data-call-position]');
    const navigate=delta=>{const nextIndex=index+delta;if(nextIndex<0||nextIndex>=ids.length)return;index=nextIndex;renderCall(ids[index]);};
    const sync=()=>{position.textContent=(index+1)+' / '+ids.length;prev.disabled=index===0;next.disabled=index===ids.length-1;};
    prev.addEventListener('click',()=>navigate(-1));next.addEventListener('click',()=>navigate(1));
    const body = overlay.querySelector('.performance-call-body');
    const sheet = overlay.querySelector('[role="dialog"]');
    const close = () => { overlay.remove(); document.removeEventListener('keydown',onKey); closeCurrent = null; if(trigger?.isConnected)trigger.focus(); };
    const onKey = event => {
      if(event.key === 'Escape')close();
      if(event.key === 'ArrowLeft' && !['INPUT','TEXTAREA'].includes(event.target?.tagName)){event.preventDefault();navigate(-1);}
      if(event.key === 'ArrowRight' && !['INPUT','TEXTAREA'].includes(event.target?.tagName)){event.preventDefault();navigate(1);}
      if(event.key === 'Tab') { const focusable=[...overlay.querySelectorAll('button:not(:disabled)')];const i=focusable.indexOf(document.activeElement);if(event.shiftKey&&i===0){event.preventDefault();focusable.at(-1)?.focus();}else if(!event.shiftKey&&i===focusable.length-1){event.preventDefault();focusable[0]?.focus();} }
    };
    overlay.querySelector('.activity-transcript-close').addEventListener('click',close);
    overlay.addEventListener('click',event => {if(event.target === overlay)close();});
    document.addEventListener('keydown',onKey);
    closeCurrent = close;
    document.body.appendChild(overlay);
    sheet.focus();
    async function renderCall(selectedId){
      sync();
      body.setAttribute('role','status');
      body.textContent='Loading saved call details…';
      try {
      const {data:call,error} = await client.from('callcenter_call_activity')
        .select('id,user_id,crm_id,duration_seconds,outcome,call_sid,caller_id_used,connected_at,ended_at,created_at')
        .eq('id',selectedId).eq('user_id',userId).maybeSingle();
      if(error)throw error;
      if(!call)throw new Error('This call is unavailable for this account.');
      const [leadResult,transcriptResult] = await Promise.all([
        call.crm_id ? client.from('crm').select('id,company,name,phone,notes,stage').eq('id',call.crm_id).maybeSingle() : Promise.resolve({data:null}),
        client.from('callcenter_transcripts').select('id,call_activity_id,company,phone,transcript,segments,started_at,ended_at,created_at')
          .eq('call_activity_id',call.id).eq('user_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle()
      ]);
      const historyResult = await window.SteadyHandsTranscriptExport.history(client,call.crm_id,userId);
      const history = (historyResult.data||[]).filter(t=>t.call_activity_id!==call.id && (t.transcript||Array.isArray(t.segments)&&t.segments.length));
      const previousHTML = historyResult.error ? '<p role="alert">Previous conversations could not load: '+esc(historyResult.error.message)+'</p>' :
        history.map((t,i)=>'<details class="performance-previous-call"><summary>'+esc(date(t.started_at||t.created_at))+' · Previous call</summary><button type="button" data-previous-export="'+i+'">Export Transcript</button><div class="performance-call-conversation">'+
        (Array.isArray(t.segments)&&t.segments.length?t.segments.filter(x=>x?.text).map(x=>'<p><strong>'+esc(x.speaker||'Speaker')+':</strong> '+esc(x.text)+'</p>').join(''):'<p>'+esc(t.transcript||'No transcript')+'</p>')+'</div></details>').join('') || '<p>No earlier saved conversations for this company.</p>';
      const lead = leadResult.data || {}, transcript = transcriptResult.data;
      if(!overlay.isConnected||ids[index]!==String(selectedId))return;
      overlay.querySelector('#performanceCallTitle').textContent = lead.company || lead.name || transcript?.company || 'Call Details';
      const segments = Array.isArray(transcript?.segments) ? transcript.segments.filter(s => s && String(s.text || '').trim()) : [];
      const conversation = segments.length ? segments.map(s => `<div class="performance-call-line ${s.speaker === 'customer' ? 'customer' : 'agent'}"><strong>${s.speaker === 'customer' ? 'Customer' : s.speaker === 'agent' ? 'You' : 'Speaker'}</strong><p>${esc(s.text)}</p></div>`).join('') : `<p class="performance-call-plain">${esc(transcript?.transcript || 'No transcript was saved for this call.')}</p>`;
      const seconds = Math.max(0,Number(call.duration_seconds)||0);
      body.removeAttribute('role');
      body.innerHTML = `<dl class="performance-call-fields">${field('Outcome',call.outcome)}${field('Phone',lead.phone || transcript?.phone)}${field('Duration',Math.floor(seconds/60)+'m '+Math.floor(seconds%60)+'s')}${field('Recorded',date(call.created_at))}${field('Caller ID used',call.caller_id_used)}${field('Connected',date(call.connected_at || transcript?.started_at))}${field('Ended',date(call.ended_at || transcript?.ended_at))}${field('Stage',lead.stage)}</dl><button type="button" data-current-export ${transcriptResult.error||!transcript||!(transcript.transcript||segments.length)?'disabled':''}>Export Transcript</button><h3>Conversation</h3><div class="performance-call-conversation">${transcriptResult.error ? '<p role="alert">Unable to load the transcript. Close and reopen these details to retry.</p>' : conversation}</div><h3>Previous conversations (same company)</h3>${previousHTML}<h3>Notes</h3><p class="performance-call-plain">${esc(leadResult.error ? 'Unable to load lead notes.' : lead.notes || 'No lead notes.')}</p><h3>Call identifiers</h3><dl class="performance-call-fields performance-call-identifiers">${field('Activity ID',call.id)}${field('Transcript ID',transcript?.id || 'Not available')}${field('Twilio CallSid',call.call_sid)}</dl>`;
      body.querySelector('[data-current-export]')?.addEventListener('click',()=>window.SteadyHandsTranscriptExport?.single({id:call.id,lead:lead.company||lead.name||transcript?.company,date:call.created_at,outcome:call.outcome,duration:call.duration_seconds},transcript));
      body.querySelectorAll('[data-previous-export]').forEach(button=>button.addEventListener('click',()=>window.SteadyHandsTranscriptExport?.previous(history[Number(button.dataset.previousExport)],lead.company||lead.name)));
    } catch(error) {
      if(overlay.isConnected&&ids[index]===String(selectedId))body.innerHTML = `<p role="alert">${esc(error.message || 'Unable to load call details. Close and reopen to retry.')}</p>`;
    }
    }
    await renderCall(ids[index]);
  };
})();
