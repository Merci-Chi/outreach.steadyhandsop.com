(() => {
  'use strict';

  const SUPABASE_URL = 'https://glonbvrcudwuzjundrii.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';
  const RPC_NAME = 'my_assigned_leads_v1';
  const SELECT_KEY = 'steadyhands-selected-outreach-crm-id';

  // Real online brand icons; neutral online icon set for generic source categories.
  const SOURCE_ICONS = {
    'Booksy': ['simple-icons:booksy', '#0068FF', 'booksy'],
    'Chamber of Commerce': ['lucide:landmark', '#64748B', 'chamber'],
    'Facebook': ['simple-icons:facebook', '#1877F2', 'facebook'],
    'Found Online': ['lucide:globe', '#0EA5E9', 'online'],
    'Google': ['simple-icons:google', '#4285F4', 'google'],
    'Google Maps': ['simple-icons:googlemaps', '#34A853', 'maps'],
    'Instagram': ['simple-icons:instagram', '#E4405F', 'instagram'],
    'LinkedIn': ['simple-icons:linkedin', '#0A66C2', 'linkedin'],
    'Nextdoor': ['favicon:nextdoor', '#8ED500', 'nextdoor'],
    'Other': ['lucide:shapes', '#64748B', 'other'],
    'Referral': ['lucide:users-round', '#8B5CF6', 'referral'],
    'TikTok': ['simple-icons:tiktok', '#111827', 'tiktok'],
    'Yelp': ['simple-icons:yelp', '#D32323', 'yelp']
  };
  const SOURCE_DEFAULT_ICON = ['lucide:globe', '#64748B', 'other'];

  const state = {
    page: 1,
    pageSize: 10,
    total: 0,
    matching: 0,
    followups: 0,
    sort: 'newest',
    contactFilter: 'all',
    previewFilter: 'all',
    desc: false,
    query: '',
    rows: [],
    selectedRows: new Set(),
    tags: [],
    sources: [],
    stages: [],
    tagOptions: [],
    sourceOptions: [],
    stageOptions: [],
    followupCategories: [],
    tagMode: 'AND',
    sourceMode: 'AND',
    stageMode: 'OR'
  };

  try {
    const saved=JSON.parse(localStorage.getItem('steadyhands-my-leads-sort-filter')||'{}');
    if(['newest','oldest','az','za','recent','least'].includes(saved.sort)) state.sort=saved.sort;
    if(['all','never','called'].includes(saved.contact)) state.contactFilter=saved.contact;
    if(['all','yes','no'].includes(saved.preview)) state.previewFilter=saved.preview;
  }catch(e){}

  let client = null;
  let searchTimer = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function initClient() {
    if (window.steadyHandsCRMClient) return window.steadyHandsCRMClient;
    if (!window.supabase) throw new Error('Supabase client library is unavailable.');
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.steadyHandsCRMClient = client;
    return client;
  }

  function setStatus(message, type = 'success') {
    const status = $('#myLeadsStatus');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.textContent = '';
      status.classList.remove('is-error', 'is-success');
      return;
    }
    status.hidden = type === 'silent';
    status.textContent = message;
    status.classList.remove('is-error', 'is-success');
    if (!status.hidden) status.classList.add(type === 'error' ? 'is-error' : 'is-success');
  }

  function initials(text) {
    return String(text || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
  }

  function htmlEscape(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatNum(value) {
    return Number(value || 0).toLocaleString();
  }

  const TAG_GROUPS = [
    { className: 'tag-website', names: ['No Site', 'Broken Site', 'Outdated Site'] },
    { className: 'tag-call', names: ['No Answer', 'Left Voicemail', 'Call Back', 'Wrong Number', 'Not Interested'] },
    { className: 'tag-response', names: ['Needs More Info', 'Skeptical'] },
    { className: 'tag-special-green', names: ['Spanish', 'Spanish?'] },
    { className: 'tag-gray', names: ['No Phone'] }
  ];

  function tagGroupForLabel(label) {
    const key = String(label || '').trim().toLocaleLowerCase();
    return TAG_GROUPS.find(group => group.names.some(name => name.toLocaleLowerCase() === key));
  }

  function tagPriority(label) {
    const key = String(label || '').trim().toLocaleLowerCase();
    let index = 0;
    for (const group of TAG_GROUPS) {
      for (const name of group.names) {
        if (name.toLocaleLowerCase() === key) return index;
        index += 1;
      }
    }
    return 1000;
  }

  function colorClassForTag(label) {
    const key = String(label || '').trim().toLocaleLowerCase();
    if (key === 'not interested') return 'tag-special-red';
    return tagGroupForLabel(label)?.className || 'tag-gray';
  }

  function colorClassForLabel(label) {
    const name = String(label || '').toLowerCase();
    if (/land|tree|lawn|preview|qualified|sold|has preview|meeting/.test(name)) return 'tag-green';
    if (/google|website|new|plumbing|residential|callback|call back/.test(name)) return 'tag-blue';
    if (/facebook|contacted|old|quote|spanish|commercial/.test(name)) return 'tag-purple';
    if (/follow|proposal|needs review|solar|construction/.test(name)) return 'tag-orange';
    if (/hot|not interested|no preview|do not call|hvac|emergency|yelp/.test(name)) return 'tag-red';
    if (/cleaning|found online/.test(name)) return 'tag-cyan';
    if (/referral/.test(name)) return 'tag-gold';
    if (/remodel|owner/.test(name)) return 'tag-pink';
    return 'tag-gray';
  }

  function arrayify(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [value].filter(Boolean);
      } catch {
        return value.split(',').map(v => v.trim()).filter(Boolean);
      }
    }
    return [];
  }

  function locationText(row) {
    const city = row.city || row.location_city || row.location || '';
    const stateCode = row.state_code || row.state || '';
    const main = [city, stateCode].filter(Boolean).join(', ') || 'No location';
    const tz = row.local_time || row.localTime || row.timezone_label || row.timezone || '';
    return { main, sub: tz };
  }

  function sourceIcon(source) {
    const spec = SOURCE_ICONS[String(source || '').trim()] || SOURCE_DEFAULT_ICON;
    const [icon, color, variant] = spec;
    const url = icon === 'favicon:nextdoor' ? 'https://www.google.com/s2/favicons?domain=nextdoor.com&sz=64' : `https://api.iconify.design/${icon.replace(':', '/')}.svg?color=${encodeURIComponent(color)}`;
    const fallback = 'https://api.iconify.design/lucide/globe.svg?color=%2364748B';
    return `<span class="source-icon-badge source-icon-${variant}" aria-hidden="true"><img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback!=='1'){this.dataset.fallback='1';this.src='${fallback}';}else{this.style.display='none';this.parentNode.textContent='•';}" /></span>`;
  }

  function sourceColorClass(source) {
    const spec = SOURCE_ICONS[String(source || '').trim()] || SOURCE_DEFAULT_ICON;
    return `source-brand-${spec[2]}`;
  }

  function updateHeaderSelectionState() {
    const checkbox = $('#headerCheckbox');
    const visibleIds = state.rows.map(row => String(row.id ?? row.crm_id ?? ''));
    const selectedVisible = visibleIds.filter(id => id && state.selectedRows.has(id));
    checkbox?.classList.toggle('is-checked', visibleIds.length > 0 && selectedVisible.length === visibleIds.length);
  }

  function toggleRowSelection(id, checked) {
    if (!id) return;
    if (checked) state.selectedRows.add(id);
    else state.selectedRows.delete(id);
    updateHeaderSelectionState();
    updateBulkQueueButton();
  }

  function updateBulkQueueButton() {
    const button = $('#bulkAddToQueueBtn');
    if (!button) return;
    const count = state.selectedRows.size;
    button.disabled = count === 0;
    button.title = count ? `Add ${count} selected lead${count===1?'':'s'} to a queue` : 'Select leads to add to a queue';
    const badge = $('#bulkQueueCount');
    if (badge) {badge.hidden = !count; badge.textContent = String(count);}
  }

  function buildRow(row) {
    const id = String(row.id ?? row.crm_id ?? '');
    const company = row.company || row.business_name || row.business || 'Untitled business';
    const industry = row.category || row.industry || row.business_type || 'Business';
    const contact = row.contact_name || row.name || 'No contact';
    const title = row.contact_title || row.title || row.role || 'Owner';
    const phone = row.phone || row.mobile || row.altphone || 'No phone';
    const email = row.email || row.email_address || 'No email';
    const loc = locationText(row);
    const stage = row.stage || 'New';
    const tags = arrayify(row.tags).slice(0, 3);
    const sources = arrayify(row.sources);
    const source = sources[0] || row.source || 'Other';
    const previewUrl = ''; // Preview is resolved from CRM.sitekey on click; never trust stored URLs.

    return `
      <tr data-row-id="${htmlEscape(id)}">
        <td>
          <div class="ml-row-controls"><input class="table-check" type="checkbox" aria-label="Select ${htmlEscape(company)}" ${state.selectedRows.has(id) ? 'checked' : ''} data-select-row="${htmlEscape(id)}" /><button type="button" class="row-action-btn" data-open-menu="${htmlEscape(id)}" aria-label="Actions for ${htmlEscape(company)}" title="Lead actions"><i data-lucide="arrow-right"></i></button></div>
        </td>
        <td>
          <div class="company-cell">
            <div class="company-avatar">${htmlEscape(initials(company))}</div>
            <div>
              <div class="company-name">${htmlEscape(company)}</div>
              <span class="company-sub">${htmlEscape(industry)}</span>
            </div>
          </div>
        </td>
        <td>
          <div class="contact-name">${htmlEscape(contact)}</div>
          <span class="contact-sub">${htmlEscape(title)}</span>
        </td>
        <td>
          <div class="phone-main">${htmlEscape(phone)}</div>
          <span class="phone-sub">${htmlEscape(email)}</span>
        </td>
        <td>
          <div class="location-main">${htmlEscape(loc.main)}</div>
          <span class="location-time">${htmlEscape(loc.sub || 'Local time unavailable')}</span>
        </td>
        <td>
          <div class="pill-row">
            ${tags.length ? tags.map(tag => `<span class="data-pill ${colorClassForTag(tag)}">${htmlEscape(tag)}</span>`).join('') : `<span class="data-pill tag-gray">No tags</span>`}
          </div>
        </td>
        <td>
          <div class="pill-row">
            <span class="data-pill source-pill ${sourceColorClass(source)}">${sourceIcon(source)}${htmlEscape(source)}</span>
          </div>
        </td>
        <td>
          <div class="pill-row">
            <span class="data-pill ${colorClassForLabel(stage)}">${htmlEscape(stage)}</span>
          </div>
        </td>
      </tr>
    `;
  }

  function hasContact(row) {
    return !!(row.lastcalled || row.callbackat || row.outcome && String(row.outcome).trim() && !['notstarted','not_started','new'].includes(String(row.outcome).toLowerCase()));
  }

  function hasPreview(row) { return !!String(row.sitekey || '').trim(); }

  function createdValue(row) {
    const date = Date.parse(row.created || row.created_at || row.createdat || row.assigned_at || '');
    return Number.isFinite(date) ? date : null;
  }

  function applyClientSort(rows) {
    const sorted = [...rows];
    const name = row => String(row.company || row.business_name || row.business || '').toLowerCase();
    const contactTime = row => {const t=Date.parse(row.lastcalled || '');return Number.isFinite(t)?t:0;};
    sorted.sort((a,b) => {
      switch (state.sort) {
        case 'newest': case 'oldest': {
          const av=createdValue(a),bv=createdValue(b);
          // Fallback to the server's ID ordering when a creation date isn't supplied.
          const diff=av!==null&&bv!==null ? av-bv : String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true});
          return (state.sort==='newest'?-diff:diff);
        }
        case 'recent': return contactTime(b)-contactTime(a) || name(a).localeCompare(name(b));
        case 'least': return contactTime(a)-contactTime(b) || name(a).localeCompare(name(b));
        case 'az': return name(a).localeCompare(name(b));
        case 'za': return name(b).localeCompare(name(a));
        default: {
          const getValue = row => state.sort==='contact' ? row.contact_name||row.name||'' : state.sort==='phone' ? row.phone||row.email||'' : state.sort==='location' ? `${row.city||row.location||''} ${row.state_code||row.state||''}` : state.sort==='stage' ? row.stage||'New' : name(row);
          const v=String(getValue(a)).localeCompare(String(getValue(b)),undefined,{numeric:true});
          return state.desc?-v:v;
        }
      }
    });
    return sorted;
  }

  function renderTable() {
    const tbody = $('#myLeadsTableBody');
    if (!tbody) return;

    if (!state.rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty-row">No assigned leads to show yet.</td></tr>`;
    } else {
      const sortedRows = applyClientSort(state.rows);
      tbody.innerHTML = sortedRows.map(buildRow).join('');
    }

    const start = state.matching ? (state.page - 1) * state.pageSize + 1 : 0;
    const end = state.matching ? Math.min((state.page - 1) * state.pageSize + state.rows.length, state.matching) : 0;
    const text = `Showing ${formatNum(start)}–${formatNum(end)} of ${formatNum(state.matching)} leads`;
    const metaTop = $('#tableMetaTop');
    const metaBottom = $('#tableMetaBottom');
    if (metaTop) metaTop.textContent = text;
    if (metaBottom) metaBottom.textContent = text;

    $('#statOnPage').textContent = formatNum(state.rows.length);
    updateHeaderSelectionState();
    updateBulkQueueButton();
    bindTableEvents();
    renderPagination();
    refreshIcons();
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil((state.matching || 0) / state.pageSize));
    const targets = [$('#paginationTop'), $('#paginationBottom')].filter(Boolean);

    const pages = [];
    const start = Math.max(1, state.page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let p = start; p <= end; p += 1) pages.push(p);

    const html = `
      <button type="button" class="page-btn" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>‹</button>
      ${pages.map(p => `<button type="button" class="page-btn ${p === state.page ? 'is-active' : ''}" data-page="${p}">${p}</button>`).join('')}
      <button type="button" class="page-btn" data-page="${state.page + 1}" ${state.page >= totalPages ? 'disabled' : ''}>›</button>
    `;

    targets.forEach(target => {
      target.innerHTML = html;
      $$('[data-page]', target).forEach(btn => btn.addEventListener('click', () => {
        const next = Number(btn.dataset.page || state.page);
        if (!Number.isFinite(next) || next < 1 || next > totalPages || next === state.page) return;
        state.page = next;
        displayCachedLeads();
      }));
    });
  }

  const PIPELINE_STAGE_CHOICES = [
    ['called','Called'], ['follow_up','Follow-up'], ['portal_link_sent','Portal Link Sent'],
    ['account_created','Account Created'], ['reviewing_site','Reviewing Site'],
    ['ready_to_buy','Ready to Buy'], ['cancelled','Cancelled']
  ];
  const FOLLOWUP_CHOICES = ['Interested','Unsure','Needs More Info','Not Now','Budget Concerns'];
  const normalizeStage = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  function renderStageOptions() {
    const main = $('#stageOptionGridPopup');
    const secondary = $('#stageOptionGrid');
    const available = new Set(PIPELINE_STAGE_CHOICES.map(([key]) => key));
    const extra = state.stageOptions.map(item => typeof item === 'string' ? item : item.name)
      .filter(Boolean).filter(label => !available.has(normalizeStage(label)));
    const choices = [...PIPELINE_STAGE_CHOICES, ...extra.map(label => [normalizeStage(label),label])];
    const markup = choices.map(([key,label],index) => {
      const checked = state.stages.some(selected => normalizeStage(selected) === key);
      return `<button type="button" class="ml-stage-choice ${checked ? 'is-selected' : ''}" data-stage-chip="${htmlEscape(key)}" aria-pressed="${checked}"><span class="ml-stage-number">${key === 'cancelled' ? '×' : index + 1}</span><span class="ml-stage-name">${htmlEscape(label)}</span><span class="ml-stage-tick">✓</span></button>`;
    }).join('');
    [main,secondary].filter(Boolean).forEach(wrap => {
      wrap.innerHTML = markup;
      wrap.querySelectorAll('[data-stage-chip]').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.stageChip;
        const index = state.stages.findIndex(v => normalizeStage(v) === key);
        if (index >= 0) state.stages.splice(index,1); else state.stages.push(key);
        if (key === 'follow_up' && index >= 0) state.followupCategories = [];
        renderStageOptions(); updateToolbarBadges();
      }));
    });
    const followWrap = $('#stageFollowUpFilters');
    if (followWrap) followWrap.hidden = !state.stages.some(s => normalizeStage(s) === 'follow_up');
    const followGrid = $('#followUpOptionGrid');
    if (followGrid) {
      followGrid.innerHTML = FOLLOWUP_CHOICES.map(label => `<button type="button" class="ml-followup-choice ${state.followupCategories.includes(label) ? 'is-selected' : ''}" aria-pressed="${state.followupCategories.includes(label)}" data-followup-filter="${htmlEscape(label)}">${htmlEscape(label)}</button>`).join('');
      followGrid.querySelectorAll('[data-followup-filter]').forEach(btn => btn.addEventListener('click', () => {
        const label = btn.dataset.followupFilter;
        const idx = state.followupCategories.indexOf(label);
        if(idx < 0) state.followupCategories.push(label); else state.followupCategories.splice(idx,1);
        renderStageOptions();
      }));
    }
  }

  function renderModalOptions(kind, searchTerm = '') {
    const isTag = kind === 'tags';
    const stateKey = isTag ? 'tags' : 'sources';
    const optionsKey = isTag ? 'tagOptions' : 'sourceOptions';
    const target = isTag ? $('#tagOptionGrid') : $('#sourceOptionGrid');
    if (!target) return;

    const selected = state[stateKey];
    const options = state[optionsKey].filter(item => String(item.name || '').toLowerCase().includes(searchTerm.trim().toLowerCase()));
    const itemMarkup = item => {
      const name = item.name || 'Unknown';
      const checked = selected.includes(name);
      if (isTag) {
        return `
          <button type="button" class="modal-option tag-flat-option ${checked ? 'is-selected' : ''}" data-tag-check="${htmlEscape(name)}" aria-pressed="${checked ? 'true' : 'false'}">
            <span class="modal-chip ${colorClassForTag(name)}"><span class="tag-pill-label">${htmlEscape(name)}</span><span class="modal-option-count">${formatNum(item.count)}</span></span>
          </button>
        `;
      }
      return `
        <label class="modal-option ${sourceColorClass(name)}">
          <input type="checkbox" data-${stateKey.slice(0,-1)}-check="${htmlEscape(name)}" ${checked ? 'checked' : ''} />
          <span class="modal-option-main">
            <span class="modal-option-icon">${sourceIcon(name)}</span><span class="modal-option-label">${htmlEscape(name)}</span>
          </span>
          <span class="modal-option-count">${formatNum(item.count)}</span>
        </label>
      `;
    };

    if (isTag) {
      const ordered = [...options].sort((a, b) => {
        const ap = tagPriority(a.name);
        const bp = tagPriority(b.name);
        if (ap !== bp) return ap - bp;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      const colorSections = [
        { key: 'tag-website', title: 'Website', subtitle: 'Blue' },
        { key: 'tag-call', title: 'Call Outcomes', subtitle: 'Orange' },
        { key: 'tag-special-red', title: 'Not Interested', subtitle: 'Pink' },
        { key: 'tag-response', title: 'Interest & Questions', subtitle: 'Purple' },
        { key: 'tag-special-green', title: 'Language', subtitle: 'Green' },
        { key: 'tag-gray', title: 'Other Tags', subtitle: 'Gray' }
      ];
      target.innerHTML = ordered.length ? colorSections.map(section => {
        const matching = ordered.filter(item => colorClassForTag(item.name) === section.key);
        if (!matching.length) return '';
        return `<section class="ml-tag-color-section" aria-label="${htmlEscape(section.title)}">
          <div class="ml-tag-color-heading"><span class="ml-tag-color-dot ${section.key}" aria-hidden="true"></span><span>${htmlEscape(section.title)}</span><span class="ml-tag-color-total">${matching.length} tags</span></div>
          <div class="ml-tag-color-items">${matching.map(itemMarkup).join('')}</div>
        </section>`;
      }).join('') : '<div class="table-empty-row">No tags found.</div>';
    } else {
      target.innerHTML = options.map(itemMarkup).join('') || `<div class="table-empty-row" style="grid-column:1/-1">No options found.</div>`;
    }

    if (isTag) {
      $$('[data-tag-check]', target).forEach(button => {
        button.addEventListener('click', () => {
          const value = button.dataset.tagCheck;
          if (!value) return;
          const idx = state.tags.indexOf(value);
          if (idx >= 0) state.tags.splice(idx, 1);
          else state.tags.push(value);
          renderModalOptions('tags', $('#tagSearchInput')?.value || '');
          updateToolbarBadges();
          updateSelectAllChecks();
        });
      });
    } else {
      $$(`input[data-${stateKey.slice(0,-1)}-check]`, target).forEach(input => {
        input.addEventListener('change', () => {
          const value = input.dataset[`${stateKey.slice(0,-1)}Check`];
          if (!value) return;
          const idx = state[stateKey].indexOf(value);
          if (input.checked && idx === -1) state[stateKey].push(value);
          if (!input.checked && idx >= 0) state[stateKey].splice(idx, 1);
          updateToolbarBadges();
          updateSelectAllChecks();
        });
      });
    }

    updateSelectAllChecks();
  }

  function updateToolbarBadges() {
    const tagBadge = $('#tagBadge');
    const sourceBadge = $('#sourceBadge');
    if (tagBadge) {
      tagBadge.hidden = !state.tags.length;
      tagBadge.textContent = String(state.tags.length);
    }
    if (sourceBadge) {
      sourceBadge.hidden = !state.sources.length;
      sourceBadge.textContent = String(state.sources.length);
    }
    $('#openTagsBtn')?.classList.toggle('is-active', !!state.tags.length);
    $('#headerTagsBtn')?.classList.toggle('is-active', !!state.tags.length);
    $('#openSourcesBtn')?.classList.toggle('is-active', !!state.sources.length);
    $('#headerSourcesBtn')?.classList.toggle('is-active', !!state.sources.length);
    const activeCount = state.stages.length + state.tags.length + state.sources.length + (state.contactFilter !== 'all' ? 1 : 0) + (state.previewFilter !== 'all' ? 1 : 0) + (state.sort !== 'newest' ? 1 : 0);
    $('#openFiltersBtn')?.classList.toggle('is-active', !!activeCount);
    $('#headerStageBtn')?.classList.toggle('is-active', !!state.stages.length);
    const filterBadge = $('#filterBadge');
    if (filterBadge) { filterBadge.hidden = !activeCount; filterBadge.textContent = String(activeCount); }
    const summary = $('#activeFilterSummary');
    if (summary) summary.textContent = activeCount
      ? `${state.stages.length} stage(s) · ${state.tags.length} tag(s) · ${state.sources.length} source(s)`
      : 'No filters applied';
  }

  function updateSelectAllChecks() {
    const tagSelectAll = $('#tagSelectAll');
    const sourceSelectAll = $('#sourceSelectAll');
    if (tagSelectAll) tagSelectAll.checked = !!state.tagOptions.length && state.tags.length === state.tagOptions.length;
    if (sourceSelectAll) sourceSelectAll.checked = !!state.sourceOptions.length && state.sources.length === state.sourceOptions.length;
  }

  function refreshStats() {
    $('#statTotalAssigned').textContent = formatNum(state.total);
    $('#statMatching').textContent = formatNum(state.matching);
    $('#statOnPage').textContent = formatNum(state.rows.length);
    $('#statFollowUps').textContent = formatNum(state.followups);
  }

  // The CRM assignment field is the authoritative source for this page.
  // Fetching it directly avoids depending on an optional/stale RPC definition.
  async function fetchAssignedRows() {
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const userId = auth?.user?.id;
    if (!userId) throw new Error('Please sign in to view your assigned leads.');
    const all = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const columns = 'id,company,name,phone,email,notes,tags,sources,stage,outcome,callbackdate,callbackat,lastcalled,timezone,leadpotential,tier,state_code,sitekey,previewurl,assigned_user_id,created';
      // This CRM stores the timestamp in created; avoid a failing schema probe per batch.
      const {data,error}=await client.from('crm').select(columns)
        .eq('assigned_user_id', userId).order('id', {ascending:true}).range(offset,offset+999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return all;
  }

  function matchedAssignedRows(rows) {
    const search = state.query.trim().toLowerCase();
    return rows.filter(row => {
      const tags = arrayify(row.tags).map(t => String(t).toLowerCase());
      const sources = arrayify(row.sources).concat(row.source || []).map(t => String(t).toLowerCase());
      const stage = normalizeStage(row.pipeline_stage || row.stage || '');
      if (search && ![row.company,row.name,row.phone,row.email,row.city,row.state_code,row.category,stage].some(v => String(v || '').toLowerCase().includes(search))) return false;
      const tagChoices = state.tags.map(t => String(t).toLowerCase());
      if (tagChoices.length && !(state.tagMode === 'AND' ? tagChoices.every(t => tags.includes(t)) : tagChoices.some(t => tags.includes(t)))) return false;
      const sourceChoices = state.sources.map(t => String(t).toLowerCase());
      if (sourceChoices.length && !(state.sourceMode === 'AND' ? sourceChoices.every(t => sources.includes(t)) : sourceChoices.some(t => sources.includes(t)))) return false;
      const stageChoices = state.stages.map(normalizeStage);
      if (stageChoices.length && !stageChoices.includes(stage)) return false;
      if (stage === 'follow_up' && state.followupCategories.length && !state.followupCategories.some(c => String(c).toLowerCase() === String(row.follow_up_category || '').toLowerCase())) return false;
      if (state.contactFilter === 'never' && hasContact(row)) return false;
      if (state.contactFilter === 'called' && !hasContact(row)) return false;
      if (state.previewFilter === 'yes' && !hasPreview(row)) return false;
      if (state.previewFilter === 'no' && hasPreview(row)) return false;
      return true;
    });
  }

  // Complete filter catalogs match the Outreach page (index.html / app.js).
  // Counts and search results are calculated ONLY from assigned leads.
  const AVAILABLE_TAGS = [
    'Interested','Call Back','Needs More Info','Send Preview','Requested Email',
    'Requested Text','Decision Maker','Hot Lead','Warm Lead','Cold Lead','Conversion','Sold',
    'Not Interested','No Answer','Left Voicemail','Busy','Wrong Number',
    'Already Has Someone','Bad Timing','Price Concern','Skeptical','Do Not Call',
    'Broken Site','Outdated Site','Site Removed','Already have a website',
    'No Website','Spanish?'
  ];
  const AVAILABLE_SOURCES = [
    'Facebook','Instagram','Nextdoor','Google','Google Maps','Found online',
    'Yelp','LinkedIn','TikTok','Booksy','Other'
  ];

  // Only the signed-in salesperson's assigned CRM rows may contribute
  // to filters, counts, search results, or displayed leads.
  function makeFilterOptions(rows, field) {
    const catalog = field === 'tags' ? AVAILABLE_TAGS : AVAILABLE_SOURCES;
    const counts = new Map(catalog.map(name => [name.toLocaleLowerCase(), { name, count: 0 }]));
    for (const row of rows) {
      const values = field === 'tags' ? arrayify(row.tags) : arrayify(row.sources).concat(arrayify(row.source));
      const unique = new Set(values.map(v =>
        (typeof v === 'string' ? v : (v?.name || v?.label || '')).trim().toLocaleLowerCase()
      ).filter(Boolean));
      for (const key of unique) {
        const existing = counts.get(key);
        if (existing) existing.count++;
        else counts.set(key, { name: [...unique].find(v => v === key) || key, count: 1 });
      }
    }
    return [...counts.values()];
  }

  let assignedCache = null;
  let leadsRequest = null;
  function loadAssignedFilterOptions() {
    const rows = assignedCache || [];
    state.tagOptions = makeFilterOptions(rows, 'tags');
    state.sourceOptions = makeFilterOptions(rows, 'sources');
    renderModalOptions('tags', $('#tagSearchInput')?.value || '');
    renderModalOptions('sources', $('#sourceSearchInput')?.value || '');
    updateSelectAllChecks();
  }

  function displayCachedLeads() {
    if (!assignedCache) return;
    const assigned = assignedCache;
    const filtered = matchedAssignedRows(assigned);
    state.total = assigned.length;
    state.matching = filtered.length;
    state.followups = assigned.filter(r => normalizeStage(r.pipeline_stage || r.stage) === 'follow_up').length;
    state.stageOptions = [...new Set(assigned.map(r => r.pipeline_stage || r.stage).filter(Boolean))].sort();
    const ordered = applyClientSort(filtered);
    const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, pageCount);
    state.rows = ordered.slice((state.page-1)*state.pageSize, state.page*state.pageSize);
    refreshStats();
    renderStageOptions();
    updateToolbarBadges();
    renderTable();
  }

  async function loadLeads(force = false) {
    if (assignedCache && !force) { displayCachedLeads(); return; }
    if (leadsRequest) return leadsRequest;
    leadsRequest = (async () => {
      setStatus('', 'silent');
      try {
        client = client || initClient();
        const assigned = await fetchAssignedRows();
        // Pipeline metadata is fetched in concurrent batches instead of one-by-one.
        try {
          const ids = assigned.map(row => row.id).filter(Boolean);
          const chunks = [];
          for (let n = 0; n < ids.length; n += 200) chunks.push(ids.slice(n, n+200));
          for (let n = 0; n < chunks.length; n += 5) {
            const results = await Promise.all(chunks.slice(n,n+5).map(chunk =>
              client.from('sh_pipeline_records').select('crm_id,stage,follow_up_category').in('crm_id',chunk)
            ));
            const byId = new Map(results.flatMap(result => result.error ? [] : (result.data || [])).map(p => [String(p.crm_id), p]));
            assigned.forEach(row => { const p = byId.get(String(row.id)); if(p) {row.pipeline_stage=p.stage;row.follow_up_category=p.follow_up_category;} });
            if (results.some(result => result.error)) break;
          }
        } catch(error) { console.warn('Pipeline stages unavailable; using CRM stages.', error); }
        assignedCache = assigned;
        loadAssignedFilterOptions();
        // Display leads immediately. Catalog scanning never blocks the main page.
        displayCachedLeads();
      } catch(error) {
        console.error('Assigned CRM leads failed to load:', error?.message || error, {code:error?.code,details:error?.details,hint:error?.hint});
        state.rows=[]; state.total=state.matching=state.followups=0;
        refreshStats(); renderTable();
        setStatus('Could not load your assigned leads: '+(error?.message || 'Unknown error'), 'error');
      }
    })();
    try { await leadsRequest; } finally { leadsRequest = null; }
  }

  function ensureFilterOptions() {
    // No additional Supabase query: reuse only the already-fetched assigned leads.
    loadAssignedFilterOptions();
  }

  function openModal(modalId) {
    $('#modalBackdrop')?.removeAttribute('hidden');
    if (modalId === 'tagsModal' || modalId === 'sourcesModal') ensureFilterOptions();
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModals() {
    $('#modalBackdrop')?.setAttribute('hidden', 'hidden');
    $$('.ml-modal').forEach(modal => {
      modal.setAttribute('hidden', 'hidden');
      modal.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('modal-open');
  }

  function applySearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = $('#leadSearch')?.value.trim() || '';
      state.page = 1;
      displayCachedLeads();
    }, 220);
  }

  function selectLeadForOutreach(id) {
    if (!id) return;
    try { sessionStorage.setItem(SELECT_KEY, String(id)); } catch {}
    location.assign(`index.html?crm_id=${encodeURIComponent(id)}`);
  }

  function bindTableEvents() {
    $$('[data-select-row]').forEach(input => {
      input.addEventListener('change', () => toggleRowSelection(input.dataset.selectRow, input.checked));
    });

    $$('[data-open-menu]').forEach(btn => {
      btn.addEventListener('click', () => openLeadActions(btn.dataset.openMenu));
    });
    $$('tr[data-row-id]').forEach(tr => {
      tr.addEventListener('click', event => {
        if (event.target.closest('button, input, a, label, select')) return;
        openLeadActions(tr.dataset.rowId);
      });
    });

    $$('[data-action="select"]').forEach(btn => btn.addEventListener('click', () => selectLeadForOutreach(btn.dataset.id)));
    $$('[data-action="preview"]').forEach(btn => btn.addEventListener('click', async () => { const tab=window.open('about:blank','_blank'); try {const url=await window.SteadyHandsPreviews.resolveCRM(btn.dataset.id);if(tab)tab.location.replace(url);else window.location.assign(url);}catch(e){if(tab)tab.close();alert(e.message||'Preview not available.');} }));
  }

  function closeLeadActions() {
    const existing = document.getElementById('mlLeadActionsDialog');
    existing?.remove();
    document.body.classList.remove('ml-actions-open');
  }

  function openLeadActions(id) {
    closeLeadActions();
    const row = state.rows.find(item => String(item.id ?? item.crm_id ?? '') === String(id));
    if (!row) return;
    const company = row.company || row.business_name || row.business || 'This lead';
    const contact = row.contact_name || row.name || 'No contact name available';
    const popup = document.createElement('div');
    popup.id = 'mlLeadActionsDialog';
    popup.className = 'ml-action-overlay';
    popup.innerHTML = `<section class="ml-action-dialog" role="dialog" aria-modal="true" aria-labelledby="mlActionsTitle" tabindex="-1">
      <header class="ml-action-dialog-head"><div><span class="ml-action-eyebrow">LEAD ACTIONS</span><h2 id="mlActionsTitle">${htmlEscape(company)}</h2><p>${htmlEscape(contact)}</p></div><button class="ml-action-close" type="button" data-close-actions aria-label="Close"><i data-lucide="x"></i></button></header>
      <div class="ml-action-dialog-buttons">
        <button type="button" data-lead-action="call"><i data-lucide="phone-call"></i><span>Open Call Workspace</span><i data-lucide="arrow-right"></i></button>
        <button type="button" data-lead-action="preview"><i data-lucide="globe"></i><span>View Site Preview</span><i data-lucide="external-link"></i></button>
        <button type="button" data-lead-action="queue"><i data-lucide="list-plus"></i><span>Add to Queue</span><i data-lucide="arrow-right"></i></button>
        <button type="button" data-lead-action="details"><i data-lucide="contact-round"></i><span>View Details</span><i data-lucide="arrow-right"></i></button>
      </div></section>`;
    document.body.appendChild(popup);
    document.body.classList.add('ml-actions-open');
    popup.querySelector('[data-close-actions]').addEventListener('click',closeLeadActions);
    popup.addEventListener('click',e=>{if(e.target===popup)closeLeadActions();});
    popup.querySelector('[data-lead-action="call"]').addEventListener('click',()=>{closeLeadActions();selectLeadForOutreach(id);});
    popup.querySelector('[data-lead-action="preview"]').addEventListener('click',async()=>{
      const tab=window.open('about:blank','_blank');
      closeLeadActions();
      try {const url=await window.SteadyHandsPreviews.resolveCRM(id);if(tab)tab.location.replace(url);else window.location.assign(url);}
      catch(e){if(tab)tab.close();alert(e.message||'Preview not available.');}
    });
    popup.querySelector('[data-lead-action="queue"]').addEventListener('click',()=>openQueuePicker(id,company));
    popup.querySelector('[data-lead-action="details"]').addEventListener('click',()=>{
      const safe = value => htmlEscape(value == null || value === '' ? 'Not provided' : Array.isArray(value) ? value.join(', ') : value);
      popup.querySelector('.ml-action-eyebrow').textContent = 'CONTACT DETAILS';
      popup.querySelector('.ml-action-dialog-buttons').innerHTML = `<div class="ml-details-grid">
        <div><small>Business</small><strong>${safe(company)}</strong></div>
        <div><small>Contact</small><strong>${safe(contact)}</strong></div>
        <div><small>Phone</small><strong>${safe(row.phone)}</strong></div>
        <div><small>Email</small><strong>${safe(row.email)}</strong></div>
        <div><small>Stage</small><strong>${safe(row.pipeline_stage||row.stage)}</strong></div>
        <div><small>Tags</small><strong>${safe(arrayify(row.tags))}</strong></div>
        <div><small>Sources</small><strong>${safe(arrayify(row.sources))}</strong></div>
        <div><small>Notes</small><strong>${safe(row.notes)}</strong></div>
      </div><button type="button" class="ml-dialog-back"><i data-lucide="arrow-left"></i><span>Back to actions</span></button>`;
      popup.querySelector('.ml-dialog-back').addEventListener('click',()=>openLeadActions(id));
      window.lucide?.createIcons?.({nodes:popup.querySelectorAll('[data-lucide]')});
    });
    window.lucide?.createIcons?.({nodes:popup.querySelectorAll('[data-lucide]')});
    popup.querySelector('.ml-action-dialog').focus();
  }

  async function openQueuePicker(id, company, bulkIds = null) {
    const popup = document.getElementById('mlLeadActionsDialog');
    if (!popup) return;
    const title = popup.querySelector('.ml-action-eyebrow');
    title.textContent = bulkIds ? 'ADD SELECTED TO QUEUE' : 'ADD TO QUEUE';
    const region = popup.querySelector('.ml-action-dialog-buttons');
    region.innerHTML = '<p class="ml-queue-message" role="status">Loading your queues…</p>';
    try {
      const api = initClient();
      const {data:{user},error:authError} = await api.auth.getUser();
      if(authError || !user) throw new Error('Please sign in again.');
      const {data:queues,error} = await api.from('outreach_queues').select('id,name,queue_type').eq('owner_id',user.id).order('created_at',{ascending:false});
      if(error) throw error;
      if(!document.getElementById('mlLeadActionsDialog')) return;
      if(!queues?.length){region.innerHTML='<p class="ml-queue-message">You do not have a queue yet. Create one on the Queue page first.</p><a class="ml-queue-link" href="queue.html">Go to Queue</a>';return;}
      region.innerHTML = queues.map(q=>`<button type="button" data-queue-id="${htmlEscape(q.id)}"><i data-lucide="list-plus"></i><span>${htmlEscape(q.name)}</span><i data-lucide="plus"></i></button>`).join('')+'<p class="ml-queue-message" role="status" aria-live="polite"></p>';
      window.lucide?.createIcons?.({nodes:region.querySelectorAll('[data-lucide]')});
      region.querySelectorAll('[data-queue-id]').forEach(btn=>btn.addEventListener('click',async()=>{
        const queueId=btn.dataset.queueId;
        const message=region.querySelector('.ml-queue-message');
        btn.disabled=true;
        const ids = bulkIds || [id];
        message.textContent=`Adding ${ids.length} contact${ids.length===1?'':'s'}…`;
        try {
          const existingResult=await api.from('outreach_queue_items').select('crm_id,position').eq('queue_id',queueId);
          if(existingResult.error) throw existingResult.error;
          const existingIds=new Set((existingResult.data||[]).map(item=>String(item.crm_id)));
          const last=await api.from('outreach_queue_items').select('position').eq('queue_id',queueId).order('position',{ascending:false}).limit(1);
          if(last.error) throw last.error;
          let position=Number(last.data?.[0]?.position||0);
          let added=0, skipped=0, failed=0;
          for(const selectedId of ids){
            if(existingIds.has(String(selectedId))){skipped++;continue;}
            const row=(assignedCache||[]).find(item=>String(item.id??item.crm_id)===String(selectedId)) || state.rows.find(item=>String(item.id??item.crm_id)===String(selectedId));
            if(!row){failed++;continue;}
            const check=await api.from('crm').select('id').eq('id',selectedId).eq('assigned_user_id',user.id).single();
            if(check.error){failed++;continue;}
            const name=row.company||row.business_name||row.business||'This lead';
            const result=await api.from('outreach_queue_items').insert({queue_id:queueId,crm_id:String(selectedId),company_name:name,position:++position});
            if(result.error){failed++;position--;continue;}
            added++;existingIds.add(String(selectedId));
            if(bulkIds)state.selectedRows.delete(String(selectedId));
          }
          updateBulkQueueButton();
          message.textContent=`${added} added${skipped?', '+skipped+' already in queue':''}${failed?', '+failed+' could not be added':''}.`;
          if(added)btn.querySelector('span').textContent='Completed';
          if(bulkIds && added)renderTable();
        }catch(err){message.textContent='Could not add lead: '+(err.message||'Unknown error');}
        finally {btn.disabled=false;}
      }));
    }catch(err){region.innerHTML=`<p class="ml-queue-message">${htmlEscape(err.message||'Could not load queues.')}</p>`;}
  }


  function openBulkQueuePicker() {
    const ids=[...state.selectedRows];
    if(!ids.length){setStatus('Select at least one lead first.','error');return;}
    closeLeadActions();
    const popup=document.createElement('div');
    popup.id='mlLeadActionsDialog';
    popup.className='ml-action-overlay';
    popup.innerHTML=`<section class="ml-action-dialog" role="dialog" aria-modal="true" aria-labelledby="mlActionsTitle" tabindex="-1"><header class="ml-action-dialog-head"><div><span class="ml-action-eyebrow">ADD SELECTED TO QUEUE</span><h2 id="mlActionsTitle">${ids.length} selected lead${ids.length===1?'':'s'}</h2><p>Choose a queue to add these contacts.</p></div><button class="ml-action-close" type="button" data-close-actions aria-label="Close"><i data-lucide="x"></i></button></header><div class="ml-action-dialog-buttons"></div></section>`;
    document.body.appendChild(popup);
    document.body.classList.add('ml-actions-open');
    popup.querySelector('[data-close-actions]').addEventListener('click',closeLeadActions);
    popup.addEventListener('click',e=>{if(e.target===popup)closeLeadActions();});
    window.lucide?.createIcons?.({nodes:popup.querySelectorAll('[data-lucide]')});
    popup.querySelector('.ml-action-dialog').focus();
    openQueuePicker(ids[0], '', ids);
  }

  // Header menus are true dropdowns. Keep them outside the table so scrolling
  // and sticky-header overflow never clips them.
  let activeHeaderMenu = null;
  function closeHeaderMenu() {
    if (activeHeaderMenu) activeHeaderMenu.remove();
    activeHeaderMenu = null;
    $$('.header-pill[aria-expanded="true"]').forEach(el => el.setAttribute('aria-expanded','false'));
  }

  function showHeaderMenu(trigger, items) {
    if (activeHeaderMenu && activeHeaderMenu.dataset.owner === (trigger.id || trigger.dataset.sort || 'actions')) {
      closeHeaderMenu(); return;
    }
    closeHeaderMenu();
    const menu = document.createElement('div');
    menu.className = 'ml-header-dropdown';
    menu.setAttribute('role','menu');
    menu.dataset.owner = trigger.id || trigger.dataset.sort || 'actions';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role','menuitem');
      button.textContent = item.label;
      button.addEventListener('click', () => { closeHeaderMenu(); item.action(); });
      menu.appendChild(button);
    }
    document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    const mw = menu.getBoundingClientRect().width;
    menu.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - menu.offsetHeight - 8)}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - mw - 8))}px`;
    activeHeaderMenu = menu;
    trigger.setAttribute('aria-expanded','true');
  }

  function setColumnSort(field, desc) {
    state.sort = field;
    state.desc = desc;
    $$('.sort-pill').forEach(pill => pill.classList.toggle('is-active', pill.dataset.sort === field));
    renderTable();
    // Server ordering is supported for company; other fields sort current page.
    displayCachedLeads();
  }

  function bindHeaderDropdowns() {
    $$('.sort-pill').forEach(btn => btn.addEventListener('click', () => {
      const field = btn.dataset.sort || 'company';
      showHeaderMenu(btn, [
        {label:'Sort A → Z',action:()=>setColumnSort(field,false)},
        {label:'Sort Z → A',action:()=>setColumnSort(field,true)},
        {label:'Search leads…',action:()=>{ const input=$('#leadSearch'); input?.focus(); input?.select(); }}
      ]);
    }));
    $('#toggleAllVisible')?.addEventListener('click', () => showHeaderMenu($('#toggleAllVisible'), [
      {label:'Select this page',action:()=>{ state.rows.forEach(r=>state.selectedRows.add(String(r.id??r.crm_id??'')));renderTable();}},
      {label:'Deselect this page',action:()=>{ state.rows.forEach(r=>state.selectedRows.delete(String(r.id??r.crm_id??'')));renderTable();}},
      {label:'Clear all selections',action:()=>{state.selectedRows.clear();renderTable();}}
    ]));
    const actions = $('.header-actions');
    actions?.addEventListener('click',()=>showHeaderMenu(actions,[
      {label:'Refresh leads',action:()=>loadLeads(true)},
      {label:'Clear filters',action:()=>{state.tags=[];state.sources=[];state.stages=[];state.query='';$('#leadSearch').value='';state.page=1;displayCachedLeads();}}
    ]));
    document.addEventListener('pointerdown',event=>{
      if(activeHeaderMenu && !activeHeaderMenu.contains(event.target) && !event.target.closest('.header-pill')) closeHeaderMenu();
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeHeaderMenu();});
    window.addEventListener('resize',closeHeaderMenu);
    window.addEventListener('scroll',closeHeaderMenu,true);
  }

  function bindEvents() {
    $('#leadSearch')?.addEventListener('input', applySearch);
    $('#pageSizeSelect')?.addEventListener('change', event => {
      state.pageSize = Number(event.target.value || 10);
      state.page = 1;
      loadLeads();
    });

    bindHeaderDropdowns();

    const setRadio = (name, value) => {const el = $(`input[name="${name}"][value="${value}"]`); if(el) el.checked=true;};
    const syncSortPopup = () => {setRadio('leadSort', ['newest','oldest','az','za','recent','least'].includes(state.sort)?state.sort:'newest');setRadio('leadContact',state.contactFilter);setRadio('leadPreview',state.previewFilter);};
    $('#bulkAddToQueueBtn')?.addEventListener('click', openBulkQueuePicker);
    $('#openFiltersBtn')?.addEventListener('click', () => {syncSortPopup();openModal('filtersModal');});
    $('#resetSortFilters')?.addEventListener('click', () => {
      state.sort='newest';state.desc=false;state.contactFilter='all';state.previewFilter='all';
      syncSortPopup();state.page=1;displayCachedLeads();
    });
    $('#applySortFilters')?.addEventListener('click', () => {
      state.sort=$('input[name="leadSort"]:checked')?.value||'newest';
      state.contactFilter=$('input[name="leadContact"]:checked')?.value||'all';
      state.previewFilter=$('input[name="leadPreview"]:checked')?.value||'all';
      try {localStorage.setItem('steadyhands-my-leads-sort-filter',JSON.stringify({sort:state.sort,contact:state.contactFilter,preview:state.previewFilter}));}catch(e){}
      state.page=1;closeModals();displayCachedLeads();
    });
    $('#headerStageBtn')?.addEventListener('click', () => openModal('stageModal'));
    $('#openTagsBtn')?.addEventListener('click', () => openModal('tagsModal'));
    $('#headerTagsBtn')?.addEventListener('click', () => openModal('tagsModal'));
    $('#openSourcesBtn')?.addEventListener('click', () => openModal('sourcesModal'));
    $('#headerSourcesBtn')?.addEventListener('click', () => openModal('sourcesModal'));
    $('#modalBackdrop')?.addEventListener('click', closeModals);
    $$('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModals));

    $('#tagSearchInput')?.addEventListener('input', event => renderModalOptions('tags', event.target.value));
    $('#sourceSearchInput')?.addEventListener('input', event => renderModalOptions('sources', event.target.value));

    $('#tagSelectAll')?.addEventListener('change', event => {
      state.tags = event.target.checked ? state.tagOptions.map(item => item.name).filter(Boolean) : [];
      renderModalOptions('tags', $('#tagSearchInput')?.value || '');
      updateToolbarBadges();
    });
    $('#sourceSelectAll')?.addEventListener('change', event => {
      state.sources = event.target.checked ? state.sourceOptions.map(item => item.name).filter(Boolean) : [];
      renderModalOptions('sources', $('#sourceSearchInput')?.value || '');
      updateToolbarBadges();
    });

    $('#tagModeToggle')?.addEventListener('click', event => {
      const btn = event.target.closest('button[data-mode]');
      if (!btn) return;
      state.tagMode = btn.dataset.mode || 'AND';
      $$('button', $('#tagModeToggle')).forEach(item => item.classList.toggle('is-active', item === btn));
    });
    $('#sourceModeToggle')?.addEventListener('click', event => {
      const btn = event.target.closest('button[data-mode]');
      if (!btn) return;
      state.sourceMode = btn.dataset.mode || 'AND';
      $$('button', $('#sourceModeToggle')).forEach(item => item.classList.toggle('is-active', item === btn));
    });

    $$('[data-clear]').forEach(btn => btn.addEventListener('click', () => {
      const kind = btn.dataset.clear;
      if (kind === 'tags') state.tags = [];
      if (kind === 'sources') state.sources = [];
      if (kind === 'stages' || kind === 'all') {state.stages = [];state.followupCategories = [];}
      if (kind === 'all') { state.tags = []; state.sources = []; }
      renderStageOptions();
      renderModalOptions('tags', $('#tagSearchInput')?.value || '');
      renderModalOptions('sources', $('#sourceSearchInput')?.value || '');
      updateToolbarBadges();
    }));

    $$('[data-apply-modal]').forEach(btn => btn.addEventListener('click', () => {
      state.page = 1;
      closeModals();
      displayCachedLeads();
    }));

    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLeadActions(); });
  }

  function refreshIcons() {
    window.lucide?.createIcons?.();
  }

  async function bootstrap() {
    try {
      initClient();
      bindEvents();
      refreshIcons();
      await loadLeads();
    } catch (error) {
      console.error(error);
      setStatus('Unable to start My Leads.', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();

