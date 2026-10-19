/* Account-scoped call history and callback pages. Each request adds 100 rows. */
(() => {
  'use strict';
  const SIZE = 100;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stamp = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : 'Not scheduled';
  const duration = value => { const n=Math.max(0,Math.floor(Number(value)||0)); return Math.floor(n/60)+'m '+String(n%60).padStart(2,'0')+'s'; };
  window.steadyHandsMountPerformanceHistory = async ({client,userId,displayName,root}) => {
    if(!userId || !root)return;
    root.dataset.view = 'calls';
    root.innerHTML = `<div class="performance-history-toggle" aria-label="Choose activity list"><button type="button" data-history-view="calls" aria-pressed="true" aria-controls="performanceCalls">Recent Calls</button><button type="button" data-history-view="followups" aria-pressed="false" aria-controls="performanceFollowups">Follow-ups</button></div><div class="performance-history-columns"><section class="performance-history-column" id="performanceCalls" aria-labelledby="performanceCallsTitle"><header><h2 id="performanceCallsTitle">Recent Calls</h2><span data-history-count="calls" aria-live="polite"></span></header><label class="performance-history-search"><span>Search loaded calls</span><input type="search" data-history-search="calls" placeholder="Business, phone or outcome"></label><div class="performance-history-list" data-history-list="calls"></div><p class="performance-history-status" data-history-status="calls" role="status"></p><button type="button" class="performance-load-more" data-history-more="calls">Load more</button></section><section class="performance-history-column" id="performanceFollowups" aria-labelledby="performanceFollowupsTitle"><header><h2 id="performanceFollowupsTitle">Follow-ups</h2><span data-history-count="followups" aria-live="polite"></span></header><label class="performance-history-search"><span>Search loaded follow-ups</span><input type="search" data-history-search="followups" placeholder="Business or phone"></label><div class="performance-history-list" data-history-list="followups"></div><p class="performance-history-status" data-history-status="followups" role="status"></p><button type="button" class="performance-load-more" data-history-more="followups">Load more</button></section></div>`;
    const find = (kind,part) => root.querySelector(`[data-history-${part}="${kind}"]`);
    const state = {calls:{rows:[],offset:0,more:true,busy:false,total:null},followups:{rows:[],offset:0,more:true,busy:false,total:null}};
    const leads = new Map(), transcripts = new Set();
    function render(kind) {
      const current = state[kind], term = String(find(kind,'search').value || '').trim().toLowerCase();
      const rows = current.rows.filter(row => {
        const lead = kind === 'calls' ? leads.get(String(row.crm_id)) || {} : row;
        return !term || [lead.company,lead.name,lead.phone,row.outcome].join(' ').toLowerCase().includes(term);
      });
      find(kind,'list').innerHTML = rows.map(row => {
        const lead = kind === 'calls' ? leads.get(String(row.crm_id)) || {} : row;
        const label = lead.company || lead.name || 'Lead';
        if(kind === 'calls')return `<button type="button" class="performance-history-call" data-history-call="${esc(row.id)}" aria-label="View call details for ${esc(label)}"><span class="performance-history-icon" aria-hidden="true"><i data-lucide="phone-call"></i></span><span class="performance-history-copy"><span class="performance-history-owner">${esc(displayName || 'You')}</span><strong>${esc(label)}</strong><small>${esc(stamp(row.created_at))} · ${esc(duration(row.duration_seconds))}${lead.phone ? ' · '+esc(lead.phone) : ''}</small></span><span class="performance-history-side"><span class="performance-history-outcome">${esc(String(row.outcome || 'Called').replace(/_/g,' '))}</span><small>${transcripts.has(String(row.id)) ? 'Transcript' : 'Call Details'} <span aria-hidden="true">›</span></small></span></button>`;
        const href = 'call.html?'+new URLSearchParams({crm_id:String(lead.id),number:lead.phone||'',company:label,contact:lead.name||'',timezone:lead.timezone||''}).toString();
        return `<article class="performance-history-followup"><span class="performance-history-icon" aria-hidden="true"><i data-lucide="calendar-clock"></i></span><div class="performance-history-copy"><strong>${esc(label)}</strong><small>${esc(lead.callbackdate || 'Date not set')}${lead.callbackat ? ' · '+esc(lead.callbackat) : ''}</small><small>${esc(lead.phone || 'No phone number')}</small></div>${lead.phone ? `<a class="performance-history-open" href="${esc(href)}">Open</a>` : ''}</article>`;
      }).join('') || `<p class="performance-history-empty">${current.busy ? 'Loading…' : term ? 'No matches in loaded records.' : kind === 'calls' ? 'No call history yet.' : 'No follow-ups scheduled.'}</p>`;
      find(kind,'count').textContent = current.total == null ? `${current.rows.length} loaded` : `${current.rows.length} of ${current.total}`;
      const button = find(kind,'more');
      button.disabled = current.busy;
      button.hidden = !current.more;
      button.textContent = current.busy ? 'Loading…' : 'Load more';
      window.lucide?.createIcons?.();
    }
    async function load(kind) {
      const current = state[kind];
      if(current.busy || !current.more)return;
      current.busy = true;
      find(kind,'status').textContent = '';
      render(kind);
      try {
        let query;
        if(kind === 'calls')query = client.from('callcenter_call_activity').select('id,user_id,crm_id,duration_seconds,outcome,created_at',{count:'exact'})
          .eq('user_id',userId).order('created_at',{ascending:false}).order('id',{ascending:false});
        else query = client.from('crm').select('id,company,name,phone,callbackdate,callbackat,timezone,callback_owner_id,stage',{count:'exact'})
          .eq('callback_owner_id',userId).eq('stage','callback').order('callbackdate',{ascending:true,nullsFirst:false}).order('id',{ascending:true});
        const {data,error,count} = await query.range(current.offset,current.offset+SIZE-1);
        if(error)throw error;
        const page = data || [];
        const owned = page.filter(row => kind === 'calls' ? row.user_id === userId : row.callback_owner_id === userId);
        if(kind === 'calls' && owned.length) {
          const ids = [...new Set(owned.map(row=>row.crm_id).filter(Boolean))];
          const [leadResult,transcriptResult] = await Promise.all([
            ids.length ? client.from('crm').select('id,company,name,phone').in('id',ids) : Promise.resolve({data:[]}),
            client.from('callcenter_transcripts').select('id,call_activity_id').eq('user_id',userId).in('call_activity_id',owned.map(row=>row.id))
          ]);
          if(leadResult.error)throw leadResult.error;
          for(const lead of leadResult.data || [])leads.set(String(lead.id),lead);
          for(const transcript of transcriptResult.error ? [] : transcriptResult.data || [])transcripts.add(String(transcript.call_activity_id));
        }
        const seen = new Set(current.rows.map(row=>String(row.id)));
        current.rows.push(...owned.filter(row=>!seen.has(String(row.id))));
        current.offset += page.length;
        current.total = typeof count === 'number' ? count : null;
        current.more = page.length === SIZE && (current.total == null || current.offset < current.total);
        if(!current.more && current.rows.length)find(kind,'status').textContent = 'All records loaded.';
      } catch(error) {
        find(kind,'status').textContent = 'Unable to load records. Select Load more to retry.';
      } finally {
        current.busy = false;
        render(kind);
      }
    }
    root.addEventListener('click',event => {
      const button = event.target.closest?.('button');
      if(!button)return;
      const view = button.dataset.historyView;
      if(view === 'calls' || view === 'followups') {
        root.dataset.view = view;
        root.querySelectorAll('[data-history-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.historyView === view)));
      }
      const kind = button.dataset.historyMore;
      if(kind === 'calls' || kind === 'followups')void load(kind);
      const id = button.dataset.historyCall;
      if(id && state.calls.rows.some(row=>String(row.id) === String(id)))void window.steadyHandsOpenPerformanceCall?.({client,activityId:id,userId,trigger:button});
    });
    for(const kind of ['calls','followups'])find(kind,'search').addEventListener('input',()=>render(kind));
    await Promise.all([load('calls'),load('followups')]);
  };
})();
