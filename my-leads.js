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
    sort: 'company',
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
    tagMode: 'AND',
    sourceMode: 'AND',
    stageMode: 'OR'
  };

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
          <input class="table-check" type="checkbox" ${state.selectedRows.has(id) ? 'checked' : ''} data-select-row="${htmlEscape(id)}" />
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
        <td>
          <div class="row-actions">
            <button type="button" class="row-action-btn" data-open-menu="${htmlEscape(id)}" aria-label="Open row actions">
              <i data-lucide="ellipsis"></i>
            </button>
            <div class="row-menu" id="menu-${htmlEscape(id)}">
              <button type="button" data-action="select" data-id="${htmlEscape(id)}">Open Call Workspace</button>
              <button type="button" data-action="preview" data-id="${htmlEscape(id)}">View Site Preview</button>
              <button type="button" data-action="details" data-id="${htmlEscape(id)}">View Details</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function applyClientSort(rows) {
    const sorted = [...rows];
    const getValue = row => {
      switch (state.sort) {
        case 'contact': return row.contact_name || row.name || '';
        case 'phone': return row.phone || row.email || '';
        case 'location': return `${row.city || row.location || ''} ${row.state_code || row.state || ''}`;
        case 'stage': return row.stage || 'New';
        case 'company':
        default: return row.company || row.business_name || row.business || '';
      }
    };
    sorted.sort((a, b) => {
      const av = String(getValue(a) || '').toLowerCase();
      const bv = String(getValue(b) || '').toLowerCase();
      if (av < bv) return state.desc ? 1 : -1;
      if (av > bv) return state.desc ? -1 : 1;
      return 0;
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
    $('#tableMetaTop').textContent = text;
    $('#tableMetaBottom').textContent = text;

    $('#statOnPage').textContent = formatNum(state.rows.length);
    updateHeaderSelectionState();
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
        loadLeads();
      }));
    });
  }

  function renderStageOptions() {
    const wraps = [$('#stageOptionGrid'), $('#stageOptionGridPopup')].filter(Boolean);
    if (!wraps.length) return;
    const options = state.stageOptions.length ? state.stageOptions : [
      { name: 'New', count: 0 },
      { name: 'Contacted', count: 0 },
      { name: 'Follow Up', count: 0 },
      { name: 'Qualified', count: 0 },
      { name: 'Proposal', count: 0 },
      { name: 'Sold', count: 0 }
    ];
    const markup = options.map(item => `
      <button type="button" class="filter-chip-btn ${state.stages.includes(item.name) ? 'is-active' : ''}" data-stage-chip="${htmlEscape(item.name)}">
        ${htmlEscape(item.name)}${item.count != null ? ` (${formatNum(item.count)})` : ''}
      </button>
    `).join('');
    wraps.forEach(wrap => {
      wrap.innerHTML = markup;
      $$('[data-stage-chip]', wrap).forEach(btn => btn.addEventListener('click', () => {
        const name = btn.dataset.stageChip;
        if (!name) return;
        const idx = state.stages.indexOf(name);
        if (idx >= 0) state.stages.splice(idx, 1);
        else state.stages.push(name);
        renderStageOptions();
        updateToolbarBadges();
      }));
    });
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
      target.innerHTML = ordered.map(itemMarkup).join('') || '<div class="table-empty-row">No tags found.</div>';
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
    const activeCount = state.stages.length + state.tags.length + state.sources.length;
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
      const { data, error } = await client.from('crm')
        .select('id,company,name,phone,email,city,state_code,category,industry,stage,tags,sources,source,timezone,sitekey,previewurl,assigned_user_id')
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
      const stage = String(row.stage || 'New').toLowerCase();
      if (search && ![row.company,row.name,row.phone,row.email,row.city,row.state_code,row.category,stage].some(v => String(v || '').toLowerCase().includes(search))) return false;
      const tagChoices = state.tags.map(t => String(t).toLowerCase());
      if (tagChoices.length && !(state.tagMode === 'AND' ? tagChoices.every(t => tags.includes(t)) : tagChoices.some(t => tags.includes(t)))) return false;
      const sourceChoices = state.sources.map(t => String(t).toLowerCase());
      if (sourceChoices.length && !(state.sourceMode === 'AND' ? sourceChoices.every(t => sources.includes(t)) : sourceChoices.some(t => sources.includes(t)))) return false;
      const stageChoices = state.stages.map(t => String(t).toLowerCase());
      if (stageChoices.length && !stageChoices.includes(stage)) return false;
      return true;
    });
  }

  async function loadLeads() {
    setStatus('', 'silent');
    try {
      client = client || initClient();
      const assigned = await fetchAssignedRows();
      const filtered = matchedAssignedRows(assigned);
      state.total = assigned.length;
      state.matching = filtered.length;
      state.followups = assigned.filter(r => String(r.stage || '').toLowerCase().includes('follow')).length;
      state.tagOptions = [...new Set(assigned.flatMap(r => arrayify(r.tags)))].sort();
      state.sourceOptions = [...new Set(assigned.flatMap(r => [...arrayify(r.sources), ...(r.source ? [r.source] : [])]))].sort();
      state.stageOptions = [...new Set(assigned.map(r => r.stage || 'New'))].sort();
      const ordered = applyClientSort(filtered);
      const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
      state.page = Math.min(state.page, pageCount);
      state.rows = ordered.slice((state.page-1)*state.pageSize, state.page*state.pageSize);
      refreshStats();
      renderStageOptions();
      renderModalOptions('tags', $('#tagSearchInput')?.value || '');
      renderModalOptions('sources', $('#sourceSearchInput')?.value || '');
      updateToolbarBadges();
      renderTable();
    } catch (error) {
      console.error('Assigned CRM leads failed to load:',error);
      state.rows = [];
      state.total = state.matching = state.followups = 0;
      refreshStats();
      renderTable();
      setStatus('Could not load your assigned leads: ' + (error?.message || 'Unknown error') + '. Please refresh or contact your administrator.', 'error');
    }
  }

  function openModal(modalId) {
    $('#modalBackdrop')?.removeAttribute('hidden');
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
      loadLeads();
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
      btn.addEventListener('click', event => {
        event.stopPropagation();
        const id = btn.dataset.openMenu;
        const menu = $(`#menu-${CSS.escape(id)}`);
        const isOpen = menu?.classList.contains('is-open');
        $$('.row-menu.is-open').forEach(m => m.classList.remove('is-open'));
        if (menu && !isOpen) menu.classList.add('is-open');
      });
    });

    $$('[data-action="select"]').forEach(btn => btn.addEventListener('click', () => selectLeadForOutreach(btn.dataset.id)));
    $$('[data-action="preview"]').forEach(btn => btn.addEventListener('click', async () => { const tab=window.open('about:blank','_blank'); try {const url=await window.SteadyHandsPreviews.resolveCRM(btn.dataset.id);if(tab)tab.location.replace(url);else window.location.assign(url);}catch(e){if(tab)tab.close();alert(e.message||'Preview not available.');} }));
    $$('[data-action="details"]').forEach(btn => btn.addEventListener('click', () => {
      const row = state.rows.find(item => String(item.id ?? item.crm_id ?? '') === String(btn.dataset.id || ''));
      if (!row) return;
      if (btn.dataset.url) {
        window.open(btn.dataset.url, '_blank', 'noopener');
        return;
      }
      const email = row.email || row.email_address || '';
      if (email) {
        location.href = `mailto:${encodeURIComponent(email)}`;
      }
    }));
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
    if (field === 'company') loadLeads();
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
      {label:'Refresh leads',action:()=>loadLeads()},
      {label:'Clear filters',action:()=>{state.tags=[];state.sources=[];state.stages=[];state.query='';$('#leadSearch').value='';state.page=1;loadLeads();}}
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

    $('#openFiltersBtn')?.addEventListener('click', () => openModal('filtersModal'));
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
      if (kind === 'stages' || kind === 'all') state.stages = [];
      if (kind === 'all') { state.tags = []; state.sources = []; }
      renderStageOptions();
      renderModalOptions('tags', $('#tagSearchInput')?.value || '');
      renderModalOptions('sources', $('#sourceSearchInput')?.value || '');
      updateToolbarBadges();
    }));

    $$('[data-apply-modal]').forEach(btn => btn.addEventListener('click', () => {
      state.page = 1;
      closeModals();
      loadLeads();
    }));

    document.addEventListener('click', event => {
      if (!event.target.closest('.row-actions')) {
        $$('.row-menu.is-open').forEach(menu => menu.classList.remove('is-open'));
      }
    });
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
