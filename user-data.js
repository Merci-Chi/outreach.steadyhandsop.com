(() => {
  const URL = 'https://glonbvrcudwuzjundrii.supabase.co';
  const KEY = 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';

  const money = cents => cents == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(cents) / 100);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const ageDays = value => {
    if (!value) return Infinity;
    return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  };

  function client() {
    if (!window.supabase) return null;
    if (!window.steadyHandsCRMClient) {
      window.steadyHandsCRMClient = window.supabase.createClient(URL, KEY);
    }
    return window.steadyHandsCRMClient;
  }

  function addStyles() {
    if (document.getElementById('callcenterLiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'callcenterLiveStyles';
    style.textContent = `
      .cc-live-card{background:#fff;border:1px solid rgba(20,43,69,.08);border-radius:18px;box-shadow:0 10px 28px rgba(15,33,54,.08);padding:15px;margin-top:12px}
      .cc-live-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .cc-live-stat{background:#fff;border:1px solid #e7ebf0;border-radius:14px;padding:12px 8px;text-align:center}
      .cc-live-stat strong{display:block;font-size:20px;margin-bottom:4px}
      .cc-live-stat span{font-size:10px;color:#718096;font-weight:800}
      .cc-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900}
      .cc-status.waiting{background:#fff4df;color:#a56800}
      .cc-status.pending{background:#e9f2ff;color:#2169b8}
      .cc-status.complete,.cc-status.active{background:#e7f8ef;color:#138550}
      .cc-status.inactive{background:#fff1e4;color:#b46312}
      .cc-status.disabled{background:#fdecec;color:#b33c3c}
      .cc-row{display:flex;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid #edf0f4}
      .cc-row:last-child{border-bottom:0}
      .cc-row-main{flex:1;min-width:0}
      .cc-row-main strong{display:block;font-size:13px}
      .cc-row-main small{display:block;color:#77869a;margin-top:3px}
      .cc-row-side{text-align:right}
      .cc-row-side strong{display:block;font-size:13px}
      .cc-muted{color:#77869a;font-size:12px;line-height:1.5}
      .cc-empty{padding:20px 6px;text-align:center;color:#7d899a;font-size:12px}
      .cc-referral-rule{font-size:12px;line-height:1.55;color:#546579;margin:8px 0 0}
      .cc-code{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f6f8fb;border:1px solid #e6ebf1;border-radius:12px;padding:11px 12px;margin-top:12px;font-weight:900;letter-spacing:.8px}
      .cc-code button{border:0;background:transparent;color:#2378d2}
      .cc-overlay{position:fixed;inset:0;z-index:99999;background:rgba(7,22,37,.72);display:grid;place-items:end center;padding:0}
      .cc-sheet{width:min(430px,100%);background:#f6f8fb;border-radius:24px 24px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(0,0,0,.25)}
      .cc-progress{height:5px;background:#e2e8ef;border-radius:999px;overflow:hidden;margin-bottom:18px}
      .cc-progress span{display:block;height:100%;background:#2381e3;transition:width .2s ease}
      .cc-sheet h2{margin:0 0 7px;font-size:23px}
      .cc-sheet p{margin:0 0 15px;color:#68778a;font-size:13px;line-height:1.5}
      .cc-question{background:#fff;border:1px solid #e4e9ef;border-radius:16px;padding:14px;margin:10px 0}
      .cc-question label{display:block;font-size:12px;font-weight:900;margin-bottom:7px}
      .cc-question input{width:100%;border:1px solid #dfe5ec;border-radius:11px;padding:12px;font:inherit}
      .cc-check{display:flex;align-items:flex-start;gap:9px;background:#fff;border:1px solid #e4e9ef;border-radius:14px;padding:12px;margin:9px 0;font-size:12px;line-height:1.45}
      .cc-actions{display:flex;justify-content:space-between;gap:10px;margin-top:16px}
      .cc-actions button{border:0;border-radius:12px;padding:12px 14px;font-weight:900;min-width:105px}
      .cc-actions .primary{background:#177bdd;color:#fff;margin-left:auto}
      .cc-actions .secondary{background:#e8edf3;color:#435268}
      .cc-disabled{width:min(390px,calc(100% - 28px));background:#fff;border-radius:20px;padding:22px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.24)}
      .cc-disabled h2{margin:8px 0}
      .cc-disabled p{color:#68778a;line-height:1.5;font-size:13px}
      .cc-activity{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
    `;
    document.head.appendChild(style);
  }

  async function getSessionAndProfile() {
    const c = client();
    if (!c) return {};
    const { data:{ session } = {}, error } = await c.auth.getSession();
    if (error || !session) return {};
    const { data: profile, error: profileError } = await c
      .from('callcenter_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (profileError) {
      console.warn('Call center profile unavailable:', profileError.message);
      return { session, profile:null, schemaReady:false, schemaError:profileError };
    }
    return { session, profile, schemaReady:true, schemaError:null };
  }

  function activityState(profile) {
    if (!profile) return { label:'Unknown', cls:'inactive', days:Infinity };
    if (profile.disabled_at) return { label:'Disabled', cls:'disabled', days:Infinity };

    const referenceDate = profile.last_call_at || profile.created_at;
    const days = ageDays(referenceDate);

    if (days >= 90) return { label:'Disabled', cls:'disabled', days };
    return { label:'Active', cls:'active', days };
  }

  async function maybePromptDeviceNotifications() {
    const PROMPTED_KEY = 'steadyhands-device-notifications-prompted';
    const ENABLED_KEY = 'steadyhands-setting-device-notifications';

    if (!('Notification' in window)) return;

    try {
      if (localStorage.getItem(PROMPTED_KEY) === '1') return;
    } catch {}

    if (Notification.permission === 'granted') {
      try {
        localStorage.setItem(PROMPTED_KEY, '1');
        localStorage.setItem(ENABLED_KEY, 'true');
      } catch {}
      return;
    }

    if (Notification.permission === 'denied') {
      try {
        localStorage.setItem(PROMPTED_KEY, '1');
        localStorage.setItem(ENABLED_KEY, 'false');
      } catch {}
      return;
    }

    if (document.querySelector('.device-notification-popup-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'device-notification-popup-overlay';
    overlay.innerHTML = `
      <div class="device-notification-popup" role="dialog" aria-modal="true" aria-labelledby="deviceNotificationTitle">
        <div class="device-notification-popup-icon">
          <i data-lucide="bell-ring"></i>
        </div>

        <h2 id="deviceNotificationTitle">Allow Notifications</h2>
        <p>Turn on notifications for this device so Outreach can send call reminders, account notices, and other notifications you choose to enable.</p>

        <div class="device-notification-popup-note">
          <i data-lucide="smartphone"></i>
          <span>This setting only applies to this device.</span>
        </div>

        <div class="device-notification-popup-actions">
          <button type="button" class="device-notification-not-now" id="ccNotificationLater">Not Now</button>
          <button type="button" class="device-notification-allow" id="ccNotificationAllow">
            <i data-lucide="bell"></i>
            Allow Notifications
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    window.lucide?.createIcons();

    const finish = (enabled) => {
      try {
        localStorage.setItem(PROMPTED_KEY, '1');
        localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
      } catch {}
      overlay.remove();
    };

    overlay.querySelector('#ccNotificationLater')?.addEventListener('click', () => finish(false));

    overlay.querySelector('#ccNotificationAllow')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;

      try {
        const permission = await Notification.requestPermission();
        finish(permission === 'granted');
      } catch {
        button.disabled = false;
      }
    });
  }


  async function maybeSendAccountActivityNotification(profile) {
    if (!profile) return;

    let deviceNotificationsEnabled = false;
    try {
      deviceNotificationsEnabled = localStorage.getItem('steadyhands-setting-device-notifications') === 'true';
    } catch {}
    if (!deviceNotificationsEnabled) return;

    const referenceDate = profile.last_call_at || profile.created_at;
    if (!referenceDate) return;

    const days = ageDays(referenceDate);
    const thresholds = [
      { day:30, title:'30 days without a completed call', body:'Your account is still active. Complete a call before 90 days to keep access.' },
      { day:60, title:'60 days without a completed call', body:'Your account is still active. Complete a call before 90 days to avoid losing access.' },
      { day:83, title:'1 week until account access is disabled', body:'Complete a call within the next 7 days to keep your Outreach account active.' },
      { day:90, title:'Account access disabled', body:'No completed call has been recorded in 90 days. Contact support to renew access.' }
    ];

    const reached = thresholds.filter(item => days >= item.day).pop();
    if (!reached) return;

    const referenceKey = new Date(referenceDate).toISOString().slice(0,10);
    const storageKey = 'steadyhands-account-activity-notice-' + reached.day + '-' + referenceKey;

    try {
      if (localStorage.getItem(storageKey) === '1') return;
    } catch {}

    const showBrowserNotification = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return false;
      try {
        new Notification(reached.title, {
          body: reached.body,
          icon: 'images/icon-192.png',
          badge: 'images/icon-192.png',
          tag: 'steadyhands-account-activity-' + reached.day
        });
        return true;
      } catch {
        return false;
      }
    };

    let shown = showBrowserNotification();

    if (!shown && 'Notification' in window && Notification.permission === 'default' && reached.day >= 85) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') shown = showBrowserNotification();
      } catch {}
    }

    if (typeof window.showToast === 'function') {
      window.showToast(reached.body);
      shown = true;
    }

    if (shown) {
      try { localStorage.setItem(storageKey, '1'); } catch {}
    }
  }

  function showDisabled(profile) {
    if (document.querySelector('.cc-overlay[data-disabled]')) return;
    const overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.dataset.disabled = 'true';
    overlay.innerHTML = `
      <div class="cc-disabled">
        <i data-lucide="lock-keyhole" style="width:38px;height:38px;color:#b33c3c"></i>
        <h2>Account disabled</h2>
        <p>This account has not completed a call in 90 days. Contact support to renew access.</p>
        <button id="ccDisabledLogout" style="margin-top:10px;border:0;background:#102945;color:#fff;border-radius:12px;padding:12px 16px;font-weight:900">Log out</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('ccDisabledLogout').onclick = async () => {
      await client()?.auth.signOut();
      location.replace('login.html');
    };
    window.lucide?.createIcons();
  }

  async function showOnboarding(session, profile) {
    if (!profile || profile.onboarding_completed || document.querySelector('.cc-overlay[data-onboarding]')) return;
    const c = client();
    const overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.dataset.onboarding = 'true';
    document.body.appendChild(overlay);

    const state = {
      step: 0,
      name: profile.display_name || '',
      phone: profile.phone || '',
      commissionOk: !!profile.commission_acknowledged
    };

    const screens = [
      () => `
        <h2>Welcome</h2>
        <p>Before you start, answer a couple quick questions so your account is set up correctly.</p>
        <div class="cc-question"><label>What name should appear on your account?</label><input id="ccName" value="${esc(state.name)}" autocomplete="name"></div>
        <div class="cc-question"><label>Phone number <span style="font-weight:600;color:#8a96a6">(optional)</span></label><input id="ccPhone" value="${esc(state.phone)}" autocomplete="tel"></div>
      `,
      () => `
        <h2>How commission works</h2>
        <p>Your earnings are tied to your own sales and move through three live stages.</p>
        <div class="cc-question"><strong>1. Waiting on client payment</strong><p class="cc-muted">The sale is recorded, but the client has not paid yet.</p></div>
        <div class="cc-question"><strong>2. Pending</strong><p class="cc-muted">The client paid and your commission is waiting to be paid out.</p></div>
        <div class="cc-question"><strong>3. Complete</strong><p class="cc-muted">Your commission payout is finished.</p></div>
        <label class="cc-check"><input id="ccCommissionOk" type="checkbox" ${state.commissionOk?'checked':''}><span>I understand how the commission stages work.</span></label>
      `,
      () => `
        <h2>Account activity</h2>
        <p>An account is considered <strong>Active</strong> when it has completed a call within the last 30 days.</p>
        <div class="cc-question"><strong>30 days</strong><p class="cc-muted">At least one completed call in the last 30 days keeps the account Active.</p></div>
        <div class="cc-question"><strong>90 days</strong><p class="cc-muted">If the account has not completed a call in 90 days, access is disabled. Contact support for renewals.</p></div>
      `
    ];

    const saveInputs = () => {
      const name = document.getElementById('ccName');
      const phone = document.getElementById('ccPhone');
      const commissionOk = document.getElementById('ccCommissionOk');
      if (name) state.name = name.value.trim();
      if (phone) state.phone = phone.value.trim();
      if (commissionOk) state.commissionOk = commissionOk.checked;
    };

    async function finish() {
      saveInputs();
      if (!state.name) {
        alert('Please enter your name.');
        state.step = 0;
        render();
        return;
      }
      if (!state.commissionOk) {
        alert('Please confirm that you understand the commission stages.');
        state.step = 1;
        render();
        return;
      }
      const { error } = await c
        .from('callcenter_profiles')
        .update({
          display_name: state.name,
          phone: state.phone,
          commission_acknowledged: true,
          onboarding_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', session.user.id);

      if (error) {
        alert(error.message || 'Unable to save your account setup.');
        return;
      }
      overlay.remove();
      location.reload();
    }

    function render() {
      overlay.innerHTML = `
        <div class="cc-sheet">
          <div class="cc-progress"><span style="width:${((state.step+1)/screens.length)*100}%"></span></div>
          ${screens[state.step]()}
          <div class="cc-actions">
            ${state.step ? '<button class="secondary" id="ccBack">Back</button>' : '<span></span>'}
            <button class="primary" id="ccNext">${state.step === screens.length-1 ? 'Finish setup' : 'Continue'}</button>
          </div>
        </div>`;
      document.getElementById('ccBack')?.addEventListener('click', () => {
        saveInputs();
        state.step--;
        render();
      });
      document.getElementById('ccNext')?.addEventListener('click', () => {
        saveInputs();
        if (state.step === 0 && !state.name) return alert('Please enter your name.');
        if (state.step === 1 && !state.commissionOk) return alert('Please confirm that you understand the commission stages.');
        if (state.step === screens.length - 1) return finish();
        state.step++;
        render();
      });
      window.lucide?.createIcons();
    }

    render();
  }

  window.callcenterRecordCall = async ({
    crmId = null,
    duration = 0,
    outcome = '',
    callSid = '',
    connectedAt = null,
    endedAt = null
  } = {}) => {
    const c = client();
    if (!c) return null;

    const { data:{ session } = {} } = await c.auth.getSession();
    if (!session) return null;

    const payload = {
      user_id: session.user.id,
      crm_id: crmId || null,
      duration_seconds: Math.max(0, Number(duration) || 0),
      outcome: String(outcome || ''),
      call_sid: String(callSid || '').trim() || null,
      connected_at: connectedAt ? new Date(connectedAt).toISOString() : null,
      ended_at: endedAt ? new Date(endedAt).toISOString() : null
    };

    let { data, error } = await c
      .from('callcenter_call_activity')
      .insert(payload)
      .select('id,user_id,crm_id,duration_seconds,outcome,call_sid,caller_id_used,connected_at,ended_at,created_at')
      .single();

    // Keep call logging working while the new diagnostic columns are being
    // rolled out. Once the migration exists, the richer insert is used.
    if (error && /call_sid|caller_id_used|connected_at|ended_at/i.test(error.message || '')) {
      const legacyPayload = {
        user_id: payload.user_id,
        crm_id: payload.crm_id,
        duration_seconds: payload.duration_seconds,
        outcome: payload.outcome
      };
      const legacyResult = await c
        .from('callcenter_call_activity')
        .insert(legacyPayload)
        .select('id,user_id,crm_id,duration_seconds,outcome,created_at')
        .single();
      data = legacyResult.data;
      error = legacyResult.error;
    }

    if (error) {
      console.warn('Unable to save call activity:', error.message);
      return null;
    }

    // Ask the authenticated server function to enrich this row with the
    // actual Twilio PSTN caller ID and authoritative Twilio timestamps.
    // The call is still saved if the enrichment function is unavailable.
    if (data?.id && data?.call_sid) {
      try {
        const { data: details, error: detailsError } = await c.functions.invoke(
          'twilio-call-details',
          { body: { activity_id: data.id, call_sid: data.call_sid } }
        );

        if (detailsError || details?.ok === false) {
          console.warn('Unable to enrich call activity from Twilio:', detailsError || details);
        } else if (details?.activity) {
          Object.assign(data, details.activity);
        }
      } catch (detailsError) {
        console.warn('Unable to enrich call activity from Twilio:', detailsError);
      }
    }

    return data || null;
  };

  async function loadEarnings(session, profile) {
    if (document.title !== 'Earnings') return;

    const c = client();
    const stateBox = document.getElementById('earningsState');

    const { data: commissions = [], error: commissionsError } = await c.from('callcenter_commissions')
      .select('*').eq('user_id', session.user.id).order('created_at', { ascending:false });

    const firstError = commissionsError;
    if (firstError) {
      console.error('Unable to load earnings data:', firstError);
      if (stateBox) {
        stateBox.style.display = '';
        stateBox.innerHTML = '<strong>Unable to load earnings right now.</strong><div class="cc-muted" style="margin-top:6px">Please refresh and try again.</div>';
      }
      return;
    }

    if (stateBox) stateBox.style.display = 'none';

    const completed = commissions.filter(row => row.status === 'complete');
    const pending = commissions.filter(row => row.status === 'pending');
    const waiting = commissions.filter(row => row.status === 'waiting_client_payment');

    const commissionComplete = completed.reduce((sum,row) => sum + (Number(row.commission_amount_cents) || 0), 0);
    const commissionPending = pending.reduce((sum,row) => sum + (Number(row.commission_amount_cents) || 0), 0);

    const totalEarned = commissionComplete;
    const totalPending = commissionPending;

    const allSalesValue = commissions.reduce(
      (sum,row) => sum + (Number(row.sale_amount_cents) || 0),
      0
    );

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('earnTotal', money(totalEarned));
    setText('commissionTotal', money(commissionComplete));
    setText('pendingPayoutTotal', money(totalPending));
    setText('closedDeals', commissions.length);
    setText('pipelineValue', money(allSalesValue));

    const chart = document.getElementById('weeklyEarningsChart');
    if (chart) {
      const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setHours(0,0,0,0);
      monday.setDate(now.getDate() + diffToMonday);

      const totals = labels.map((_, index) => {
        const startDay = new Date(monday);
        startDay.setDate(monday.getDate() + index);
        const endDay = new Date(startDay);
        endDay.setDate(startDay.getDate() + 1);

        return completed
          .filter(row => {
            const when = new Date(row.completed_at || row.updated_at || row.created_at);
            return when >= startDay && when < endDay;
          })
          .reduce((sum,row) => sum + (Number(row.commission_amount_cents) || 0), 0);
      });

      const max = Math.max(...totals, 1);
      chart.innerHTML = totals.map((value,index) => {
        const height = value ? Math.max(22, Math.round((value / max) * 88)) : 10;
        return '<div class="bar-wrap"><div class="bar" style="height:' + height + 'px"><b>' + money(value) + '</b></div>' + labels[index] + '</div>';
      }).join('');
    }

    const recent = document.getElementById('recentPayouts');
    if (recent) {
      const rows = [...commissions]
        .sort((a,b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0,8);

      recent.innerHTML = rows.length ? rows.map(row => {
        const statusLabel = row.status === 'waiting_client_payment'
          ? 'Waiting on client payment'
          : row.status === 'pending'
            ? 'Pending'
            : 'Complete';

        const badgeClass = row.status === 'complete'
          ? 'paid'
          : 'pending';

        const iconClass = row.status === 'complete'
          ? ''
          : ' pending';

        const icon = row.status === 'complete'
          ? 'check'
          : 'clock-3';

        const amount = row.commission_amount_cents == null
          ? '—'
          : money(row.commission_amount_cents);

        return '<div class="payout-row">' +
          '<div class="payout-dot' + iconClass + '"><i data-lucide="' + icon + '"></i></div>' +
          '<div class="payout-main"><strong>' + esc(row.client_name || 'Client') + '</strong><small>' + new Date(row.updated_at || row.created_at).toLocaleDateString() + '</small></div>' +
          '<div class="payout-side"><strong>' + amount + '</strong><span class="badge ' + badgeClass + '">' + statusLabel + '</span></div>' +
        '</div>';
      }).join('') : '<div class="cc-empty">No sales or payouts yet.</div>';
    }

    window.lucide?.createIcons();
  }

  async function loadAccount(session, profile) {
    if (!['Account','Settings'].includes(document.title)) return;

    const main = document.querySelector('main.content');
    if (!main) return;

    const c = client();
    const state = activityState(profile);
    const displayName = profile.display_name || 'User';
    const emailAddress = session.user.email || '';
    const initials = (displayName || emailAddress || 'U')
      .split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();

    const prefKey = key => 'steadyhands-setting-' + key;
    const readPref = (key, fallback=true) => {
      try {
        const saved = localStorage.getItem(prefKey(key));
        return saved == null ? fallback : saved === 'true';
      } catch { return fallback; }
    };
    const writePref = (key, value) => {
      try { localStorage.setItem(prefKey(key), String(!!value)); } catch {}
    };

    const prefs = {
      confirmCalls: readPref('confirm-calls', true),
      deviceNotifications: readPref('device-notifications', false),
      followups: readPref('followup-reminders', true),
      earnings: readPref('earnings-updates', true),
      assignments: readPref('new-assignments', true)
    };

    const { data: permission } = await c
      .from('team_permissions')
      .select('role,active')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const isAdmin = permission?.active === true && permission?.role === 'ADMIN';

    let requestedCallerNumber = null;
    try {
      const { data: callerRows = [], error: callerError } = await c
        .from('callcenter_phone_numbers')
        .select('id,phone_number,twilio_status,active,requested_at,created_at')
        .eq('requested_by_user_id', session.user.id)
        .order('created_at', { ascending:false })
        .limit(1);

      if (!callerError) requestedCallerNumber = callerRows[0] || null;
      else if (callerError.code !== '42P01' && !/requested_by_user_id/i.test(callerError.message || '')) {
        console.warn('Unable to load outbound number request:', callerError);
      }
    } catch (error) {
      console.warn('Unable to load outbound number request:', error);
    }

    const callerNumberStatus = requestedCallerNumber
      ? (requestedCallerNumber.twilio_status === 'ready' && requestedCallerNumber.active
          ? 'Ready · ' + formatPhone(requestedCallerNumber.phone_number)
          : 'Pending approval · ' + formatPhone(requestedCallerNumber.phone_number))
      : 'Add a number';

    const statusText = state.label;
    const phoneText = profile.phone || 'Not set';

    main.innerHTML = `
      <section class="settings-profile">
        <div class="settings-avatar">${esc(initials)}</div>
        <div class="settings-profile-copy">
          <strong>${esc(displayName)}</strong>
          <span>${esc(emailAddress)}</span>
        </div>
        <button type="button" class="settings-edit-btn" data-account-action="profile">Edit</button>
      </section>

      <section class="settings-section">
        <div class="settings-section-title">Account</div>
        <button class="settings-row" type="button" data-account-action="profile">
          <span class="settings-icon"><i data-lucide="user-round"></i></span>
          <span class="settings-copy"><strong>Profile &amp; Personal Info</strong><small>${esc(phoneText)}</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
        <button class="settings-row" type="button" data-account-action="security">
          <span class="settings-icon"><i data-lucide="shield-check"></i></span>
          <span class="settings-copy"><strong>Sign-in &amp; Security</strong><small>Password and account access</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
        <button class="settings-row" type="button" data-account-action="status">
          <span class="settings-icon"><i data-lucide="activity"></i></span>
          <span class="settings-copy"><strong>Account Status</strong><small>Activity and access status</small></span>
          <span class="cc-status ${state.cls}">${esc(statusText)}</span>
        </button>
      </section>

      <section class="settings-section">
        <div class="settings-section-title">Calling</div>
        <button class="settings-row" type="button" data-account-action="caller-number">
          <span class="settings-icon"><i data-lucide="phone-forwarded"></i></span>
          <span class="settings-copy"><strong>Outbound Phone Number</strong><small>${esc(callerNumberStatus)}</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
        <button class="settings-row" type="button" data-account-action="audio">
          <span class="settings-icon"><i data-lucide="mic"></i></span>
          <span class="settings-copy"><strong>Microphone &amp; Audio</strong><small id="microphoneStatus">Check microphone access</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
        <button class="settings-row" type="button" data-toggle-setting="confirmCalls">
          <span class="settings-icon"><i data-lucide="phone-call"></i></span>
          <span class="settings-copy"><strong>Confirm Before Calling</strong><small>Ask before starting an outbound call</small></span>
          <span class="settings-switch ${prefs.confirmCalls?'on':''}" role="switch" aria-checked="${prefs.confirmCalls}"><span></span></span>
        </button>
      </section>

      <section class="settings-section">
        <div class="settings-section-title">Notifications</div>
        <button class="settings-row" type="button" data-toggle-setting="deviceNotifications">
          <span class="settings-icon"><i data-lucide="bell-ring"></i></span>
          <span class="settings-copy"><strong>Device Notifications</strong><small id="deviceNotificationStatus">Enable notifications on this device</small></span>
          <span class="settings-switch ${prefs.deviceNotifications?'on':''}" role="switch" aria-checked="${prefs.deviceNotifications}"><span></span></span>
        </button>
        <button class="settings-row" type="button" data-toggle-setting="followups">
          <span class="settings-icon"><i data-lucide="calendar-clock"></i></span>
          <span class="settings-copy"><strong>Follow-up Reminders</strong><small>Reminders for scheduled follow-ups</small></span>
          <span class="settings-switch ${prefs.followups?'on':''}" role="switch" aria-checked="${prefs.followups}"><span></span></span>
        </button>
        <button class="settings-row" type="button" data-toggle-setting="earnings">
          <span class="settings-icon"><i data-lucide="circle-dollar-sign"></i></span>
          <span class="settings-copy"><strong>Earnings Updates</strong><small>Payout and commission updates</small></span>
          <span class="settings-switch ${prefs.earnings?'on':''}" role="switch" aria-checked="${prefs.earnings}"><span></span></span>
        </button>
        <button class="settings-row" type="button" data-toggle-setting="assignments">
          <span class="settings-icon"><i data-lucide="inbox"></i></span>
          <span class="settings-copy"><strong>New Assignments</strong><small>Alerts when new work is assigned</small></span>
          <span class="settings-switch ${prefs.assignments?'on':''}" role="switch" aria-checked="${prefs.assignments}"><span></span></span>
        </button>
      </section>



      ${isAdmin ? `
      <section class="settings-section settings-admin-gateway">
        <div class="settings-section-title">Admin</div>
        <a class="settings-row" href="admin.html">
          <span class="settings-icon"><i data-lucide="shield"></i></span>
          <span class="settings-copy"><strong>Admin Settings</strong><small>Approvals and administrative controls</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </a>
      </section>` : ''}

      <section class="settings-section">
        <div class="settings-section-title">App</div>
        <button class="settings-row" type="button" data-account-action="appearance">
          <span class="settings-icon"><i data-lucide="circle-half"></i></span>
          <span class="settings-copy"><strong>Appearance</strong><small>${profile.theme_preference === 'dark' ? 'Dark mode' : 'Light mode'}</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
        <button class="settings-row" type="button" data-account-action="permissions">
          <span class="settings-icon"><i data-lucide="lock-keyhole"></i></span>
          <span class="settings-copy"><strong>Permissions</strong><small>Microphone and notification access</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
        <a class="settings-row" href="terms.html">
          <span class="settings-icon"><i data-lucide="file-text"></i></span>
          <span class="settings-copy"><strong>Terms &amp; Conditions</strong><small>Review the current terms</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </a>
        <button class="settings-row" type="button" data-account-action="about">
          <span class="settings-icon"><i data-lucide="info"></i></span>
          <span class="settings-copy"><strong>About Outreach</strong><small>Steady Hands Outreach</small></span>
          <i class="settings-chevron" data-lucide="chevron-right"></i>
        </button>
      </section>

      <div class="settings-logout-area">
        <button class="settings-logout-btn" type="button" data-account-action="logout"><i data-lucide="log-out"></i>Log Out</button>
        <div>Signed in as ${esc(emailAddress)}</div>
      </div>
    `;

    const openSheet = (title, body) => {
      document.querySelector('.settings-sheet-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'settings-sheet-overlay';
      overlay.innerHTML = `
        <div class="settings-sheet">
          <div class="settings-sheet-head">
            <h2>${title}</h2>
            <button type="button" class="settings-sheet-close" aria-label="Close"><i data-lucide="x"></i></button>
          </div>
          <div class="settings-sheet-body">${body}</div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.settings-sheet-close')?.addEventListener('click',()=>overlay.remove());
      overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
      window.lucide?.createIcons();
      return overlay;
    };

    const refreshMicStatus = async () => {
      const target = document.getElementById('microphoneStatus');
      if (!target) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        target.textContent = 'Not available on this device';
        return;
      }
      try {
        if (navigator.permissions?.query) {
          const p = await navigator.permissions.query({name:'microphone'});
          target.textContent = p.state === 'granted' ? 'Allowed' : p.state === 'denied' ? 'Permission required' : 'Tap to allow';
          return;
        }
      } catch {}
      target.textContent = 'Tap to check access';
    };
    refreshMicStatus();

    const toggleMap = {
      deviceNotifications:['device-notifications','deviceNotifications'],
      confirmCalls:['confirm-calls','confirmCalls'],
      followups:['followup-reminders','followups'],
      earnings:['earnings-updates','earnings'],
      assignments:['new-assignments','assignments']
    };

    const refreshDeviceNotificationStatus = () => {
      const target = document.getElementById('deviceNotificationStatus');
      if (!target) return;
      if (!('Notification' in window)) {
        target.textContent = 'Not supported on this device';
        return;
      }
      if (Notification.permission === 'denied') {
        target.textContent = 'Blocked in device settings';
        return;
      }
      if (prefs.deviceNotifications && Notification.permission === 'granted') {
        target.textContent = 'Allowed on this device';
        return;
      }
      target.textContent = 'Off on this device';
    };
    refreshDeviceNotificationStatus();

    main.querySelectorAll('[data-toggle-setting]').forEach(row => {
      row.addEventListener('click', async () => {
        const key = row.dataset.toggleSetting;
        const pair = toggleMap[key];
        if (!pair) return;

        if (key === 'deviceNotifications') {
          const sw = row.querySelector('.settings-switch');

          if (prefs.deviceNotifications) {
            prefs.deviceNotifications = false;
            writePref('device-notifications', false);
            sw?.classList.remove('on');
            sw?.setAttribute('aria-checked', 'false');
            refreshDeviceNotificationStatus();
            return;
          }

          if (!('Notification' in window)) {
            refreshDeviceNotificationStatus();
            return;
          }

          if (Notification.permission === 'denied') {
            refreshDeviceNotificationStatus();
            openSheet('Notifications', '<p class="settings-sheet-note">Notifications are blocked for this site. Allow them in your browser or device settings, then come back and turn Device Notifications on.</p>');
            return;
          }

          let permission = Notification.permission;
          if (permission === 'default') {
            try { permission = await Notification.requestPermission(); } catch {}
          }

          const enabled = permission === 'granted';
          prefs.deviceNotifications = enabled;
          writePref('device-notifications', enabled);
          try { localStorage.setItem('steadyhands-device-notifications-prompted', '1'); } catch {}
          sw?.classList.toggle('on', enabled);
          sw?.setAttribute('aria-checked', String(enabled));
          refreshDeviceNotificationStatus();
          return;
        }

        const next = !prefs[pair[1]];
        prefs[pair[1]] = next;
        writePref(pair[0], next);
        const sw = row.querySelector('.settings-switch');
        sw?.classList.toggle('on', next);
        sw?.setAttribute('aria-checked', String(next));
      });
    });

    main.querySelectorAll('[data-account-action]').forEach(row => {
      row.addEventListener('click', async () => {
        const action = row.dataset.accountAction;

        if (action === 'appearance') {
          const currentTheme = window.SteadyHandsTheme?.current?.() || profile.theme_preference || 'light';
          const overlay = openSheet('Appearance', `
            <p class="settings-sheet-note">Choose how Outreach looks on every device signed into this account.</p>
            <div class="settings-theme-options">
              <button type="button" class="settings-theme-option ${currentTheme === 'light' ? 'active' : ''}" data-theme-choice="light">
                <i data-lucide="sun"></i>
                <span>Light</span>
              </button>
              <button type="button" class="settings-theme-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme-choice="dark">
                <i data-lucide="moon"></i>
                <span>Dark</span>
              </button>
            </div>
            <div class="settings-inline-message" id="settingsThemeMessage"></div>
          `);

          overlay.querySelectorAll('[data-theme-choice]').forEach(button => {
            button.addEventListener('click', async () => {
              const nextTheme = button.dataset.themeChoice === 'dark' ? 'dark' : 'light';
              const message = overlay.querySelector('#settingsThemeMessage');
              overlay.querySelectorAll('[data-theme-choice]').forEach(item => item.disabled = true);
              message.textContent = 'Saving…';

              const { error } = await c
                .from('callcenter_profiles')
                .update({
                  theme_preference: nextTheme,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', session.user.id);

              if (error) {
                overlay.querySelectorAll('[data-theme-choice]').forEach(item => item.disabled = false);
                message.textContent = error.message || 'Unable to save appearance.';
                return;
              }

              profile.theme_preference = nextTheme;
              window.SteadyHandsTheme?.apply?.(nextTheme);
              overlay.querySelectorAll('[data-theme-choice]').forEach(item => {
                item.classList.toggle('active', item.dataset.themeChoice === nextTheme);
                item.disabled = false;
              });

              const appearanceRow = main.querySelector('[data-account-action="appearance"] .settings-copy small');
              if (appearanceRow) appearanceRow.textContent = nextTheme === 'dark' ? 'Dark mode' : 'Light mode';
              message.textContent = nextTheme === 'dark' ? 'Dark mode saved to your account.' : 'Light mode saved to your account.';
              window.lucide?.createIcons();
            });
          });

          window.lucide?.createIcons();
          return;
        }

        if (action === 'caller-number') {
          const normalizeE164 = value => {
            const raw = String(value || '').trim();
            const digits = raw.replace(/\D/g,'');
            if (!digits) return '';
            if (raw.startsWith('+')) return '+' + digits;
            if (digits.length === 10) return '+1' + digits;
            if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
            return '+' + digits;
          };

          if (requestedCallerNumber) {
            const ready = requestedCallerNumber.twilio_status === 'ready' && requestedCallerNumber.active;
            openSheet('Outbound Phone Number', `
              <div class="settings-status-card">
                <span class="cc-status ${ready ? 'active' : 'pending'}">${ready ? 'Ready' : 'Pending approval'}</span>
                <p><strong>${esc(formatPhone(requestedCallerNumber.phone_number))}</strong></p>
                <p>${ready
                  ? 'This number is ready to be used for your outbound calls.'
                  : 'Your number request has been received. You can keep calling while it is being reviewed.'}</p>
              </div>`);
            return;
          }

          const overlay = openSheet('Outbound Phone Number', `
            <p class="settings-sheet-note">Add the phone number you want associated with your outbound calls. It will show as pending until an administrator finishes setup.</p>
            <label class="settings-field-label">Phone number
              <input class="settings-field" id="settingsOutboundNumber" type="tel" inputmode="tel" autocomplete="tel" placeholder="(702) 555-0101">
            </label>
            <button class="settings-primary-btn" id="settingsRequestOutboundNumber" type="button">Submit Number</button>
            <div class="settings-inline-message" id="settingsOutboundNumberMessage"></div>
          `);

          overlay.querySelector('#settingsRequestOutboundNumber')?.addEventListener('click', async e => {
            const btn = e.currentTarget;
            const msg = overlay.querySelector('#settingsOutboundNumberMessage');
            const phoneNumber = normalizeE164(overlay.querySelector('#settingsOutboundNumber')?.value || '');

            if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
              msg.textContent = 'Enter a valid phone number.';
              return;
            }

            btn.disabled = true;
            msg.textContent = 'Submitting…';

            const { error } = await c
              .from('callcenter_phone_numbers')
              .insert({
                phone_number: phoneNumber,
                label: displayName + ' requested number',
                active: true,
                twilio_status: 'pending',
                requested_by_user_id: session.user.id,
                requested_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (error) {
              btn.disabled = false;
              msg.textContent = error.code === '23505'
                ? 'That phone number is already in the system.'
                : (error.message || 'Unable to submit this number.');
              return;
            }

            msg.textContent = 'Submitted. Your number is pending approval.';
            setTimeout(() => location.reload(), 650);
          });
          return;
        }

        if (action === 'profile') {
          const overlay = openSheet('Edit Profile', `
            <label class="settings-field-label">Display name<input class="settings-field" id="settingsName" value="${esc(profile.display_name || '')}" autocomplete="name"></label>
            <label class="settings-field-label">Phone number<input class="settings-field" id="settingsPhone" value="${esc(profile.phone || '')}" autocomplete="tel"></label>
            <button class="settings-primary-btn" id="settingsSaveProfile" type="button">Save Changes</button>
          `);
          overlay.querySelector('#settingsSaveProfile')?.addEventListener('click', async e => {
            const btn=e.currentTarget;
            btn.disabled=true;
            const name=overlay.querySelector('#settingsName').value.trim();
            const phone=overlay.querySelector('#settingsPhone').value.trim();
            if(!name){ btn.disabled=false; return; }
            const { error } = await c.from('callcenter_profiles').update({
              display_name:name, phone, updated_at:new Date().toISOString()
            }).eq('user_id',session.user.id);
            if(error){ btn.disabled=false; alert(error.message); return; }
            location.reload();
          });
          return;
        }

        if (action === 'security') {
          const overlay = openSheet('Sign-in & Security', `
            <p class="settings-sheet-note">Send a password reset link to <strong>${esc(emailAddress)}</strong>.</p>
            <button class="settings-primary-btn" id="settingsResetPassword" type="button">Send Password Reset Email</button>
            <div class="settings-inline-message" id="settingsSecurityMessage"></div>
          `);
          overlay.querySelector('#settingsResetPassword')?.addEventListener('click', async e => {
            const btn=e.currentTarget;
            const msg=overlay.querySelector('#settingsSecurityMessage');
            btn.disabled=true;
            msg.textContent='Sending…';
            const redirectTo=new URL('login.html?reset=1',location.href).href;
            const { error }=await c.auth.resetPasswordForEmail(emailAddress,{redirectTo});
            if(error){ msg.textContent=error.message||'Unable to send reset email.'; btn.disabled=false; return; }
            msg.textContent='Reset email sent. Check your inbox.';
          });
          return;
        }

        if (action === 'status') {
          openSheet('Account Status', `
            <div class="settings-status-card"><span class="cc-status ${state.cls}">${esc(statusText)}</span>
              <p>Your account stays active unless 90 consecutive days pass without a completed call.</p>
              <p>You will receive activity reminders along the way, including one week before access is disabled.</p>
              <p>At 90 days without a completed call, access is disabled and support must renew it.</p>
              <p><strong>Last call:</strong> ${profile.last_call_at ? esc(new Date(profile.last_call_at).toLocaleString()) : 'No calls yet'}</p>
            </div>`);
          return;
        }

        if (action === 'audio' || action === 'permissions') {
          const overlay = openSheet(action==='audio'?'Microphone & Audio':'Permissions', `
            <div class="settings-permission-row"><span><strong>Microphone</strong><small>Required for browser calling</small></span><button id="settingsMicPermission" type="button">Check Access</button></div>
            <div class="settings-permission-row" style="margin-top:10px"><span><strong>Notifications</strong><small>${!('Notification' in window) ? 'Not supported' : Notification.permission === 'granted' ? 'Allowed' : Notification.permission === 'denied' ? 'Blocked' : 'Not decided'}</small></span><button id="settingsNotificationPermission" type="button">Manage</button></div>
            <div class="settings-inline-message" id="settingsPermissionMessage"></div>
          `);
          overlay.querySelector('#settingsNotificationPermission')?.addEventListener('click', async () => {
            const msg=overlay.querySelector('#settingsPermissionMessage');
            if (!('Notification' in window)) {
              msg.textContent='Notifications are not supported on this device.';
              return;
            }
            if (Notification.permission === 'denied') {
              msg.textContent='Notifications are blocked. Allow them in your browser or device settings.';
              return;
            }
            try {
              const permission = Notification.permission === 'default'
                ? await Notification.requestPermission()
                : Notification.permission;
              const enabled = permission === 'granted';
              prefs.deviceNotifications = enabled;
              writePref('device-notifications', enabled);
              try { localStorage.setItem('steadyhands-device-notifications-prompted', '1'); } catch {}
              msg.textContent = enabled ? 'Notifications are allowed on this device.' : 'Notifications are not enabled.';
              refreshDeviceNotificationStatus();
            } catch {
              msg.textContent='Unable to change notification access.';
            }
          });

          overlay.querySelector('#settingsMicPermission')?.addEventListener('click', async e => {
            const msg=overlay.querySelector('#settingsPermissionMessage');
            try {
              const stream=await navigator.mediaDevices.getUserMedia({audio:true});
              stream.getTracks().forEach(track=>track.stop());
              msg.textContent='Microphone access is allowed.';
              refreshMicStatus();
            } catch(err) {
              msg.textContent='Microphone access is blocked. Allow it in your browser or device settings.';
            }
          });
          return;
        }
        if (action === 'about') {
          openSheet('About Outreach','<div class="settings-about"><strong>Steady Hands Outreach</strong><p>Calling, follow-up, activity, and earnings tools for the Steady Hands team.</p><small>Version 1.0</small></div>');
          return;
        }
        if (action === 'logout') {
          await c.auth.signOut();
          location.replace('login.html');
        }
      });
    });

    window.lucide?.createIcons();
  }

  async function loadActivity(session, ownProfile) {
    if (!['Activity','Performance'].includes(document.title)) return;
    const c = client(), main = document.getElementById('activityContent');
    if (!main) return;
    // Outreach Performance always belongs to the signed-in account, including
    // when a URL contains a user parameter. Team views live in the admin app.
    const selectedUserId = session.user.id;
    const {data,error} = await c.from('callcenter_call_activity')
      .select('id,user_id,crm_id,duration_seconds,outcome,created_at')
      .eq('user_id',selectedUserId).order('created_at',{ascending:false}).limit(1000);
    const activities=data || [];
    const formatDuration = seconds => {
      const total=Math.max(0,Math.floor(Number(seconds)||0));
      return Math.floor(total/60)+'m '+String(total%60).padStart(2,'0')+'s';
    };
    const now = new Date();
    const since7 = new Date(now); since7.setDate(since7.getDate()-6); since7.setHours(0,0,0,0);
    const weekRows = activities.filter(row => { const d = new Date(row.created_at); return !Number.isNaN(d.getTime()) && d >= since7; });
    const contacted = weekRows.filter(row => !/didn.t call/i.test(String(row.outcome||'')));
    const positive = contacted.filter(row => /interested|follow.?up|call.?back|requested (text|email)|sale|sold|closed/i.test(String(row.outcome||'')) && !/not interested/i.test(String(row.outcome||'')));
    const avgSeconds = contacted.length ? Math.round(contacted.reduce((sum,row)=>sum+(Number(row.duration_seconds)||0),0)/contacted.length) : 0;
    const dailyCounts = Array.from({length:7},(_,index)=>{
      const day = new Date(since7); day.setDate(day.getDate()+index);
      const next = new Date(day); next.setDate(next.getDate()+1);
      return { label:day.toLocaleDateString([], {weekday:'short'}), count:contacted.filter(row=>{const d=new Date(row.created_at);return d>=day&&d<next;}).length };
    });
    const dailyMax = Math.max(1,...dailyCounts.map(day=>day.count));
    const perfSummary = `<section class="sh-performance-panel" aria-label="Weekly productivity">
      <div class="sh-performance-heading"><div><h2>My Performance</h2><p>Last 7 days · Your recorded call activity</p></div><a href="sales.html">Sales Targets <i data-lucide="arrow-up-right"></i></a></div>
      <div class="sh-performance-metrics">
        <div class="sh-performance-metric"><span>Calls Logged</span><strong>${contacted.length}</strong><small>Manually logged and app calls</small></div>
        <div class="sh-performance-metric"><span>Positive Outcomes</span><strong>${positive.length}</strong><small>Based on logged outcomes</small></div>
        <div class="sh-performance-metric"><span>Positive Outcome Rate</span><strong>${contacted.length?Math.round(100*positive.length/contacted.length):0}%</strong><small>Not a verified close rate</small></div>
        <div class="sh-performance-metric"><span>Avg. Logged Duration</span><strong>${formatDuration(avgSeconds)}</strong><small>Based on recorded durations</small></div>
      </div>
      <div class="sh-performance-chart"><div class="sh-performance-chart-title"><strong>Call Activity</strong><span>Last 7 days</span></div><div class="sh-performance-bars" role="img" aria-label="Calls logged by day: ${dailyCounts.map(x=>x.label+' '+x.count).join(', ')}">${dailyCounts.map(day=>`<div class="sh-performance-bar-cell"><span>${day.count}</span><div class="sh-performance-bar-track"><div class="sh-performance-bar" style="height:${Math.max(day.count?7:0,Math.round(100*day.count/dailyMax))}%"></div></div><small>${day.label}</small></div>`).join('')}</div></div>
      <p class="sh-performance-disclaimer">Stats use your most recent 1,000 logged records. Regular-phone outcomes are self-reported; confirmed sales and commissions remain on Sales and Earnings.</p>
    </section>`;


    main.innerHTML = `<div id="teamPerformanceAccess" hidden></div>${error ? '<p role="alert">Performance summary is unavailable. You can retry call history below.</p>' : perfSummary}<div id="performanceHistory"></div>`;
    await window.steadyHandsMountPerformanceHistory({client:c,userId:selectedUserId,displayName:ownProfile?.display_name||'You',root:document.getElementById('performanceHistory')});
    await window.steadyHandsInitTeamPerformance?.();
    window.lucide?.createIcons();
  }
  async function loadPersonalOutreachStats(session) {
    if (document.title !== 'Outreach') return;
    const c = client();
    const start = new Date();
    start.setHours(0,0,0,0);
    const { data = [], error } = await c
      .from('callcenter_call_activity')
      .select('outcome,created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending:false })
      .limit(1000);

    if (error) return;

    const callsToday = data.filter(row => new Date(row.created_at) >= start).length;
    const callbacks = data.filter(row => /follow up|call back|callback/i.test(row.outcome || '')).length;
    const interested = data.filter(row => /interested/i.test(row.outcome || '')).length;

    if (document.getElementById('statCalls')) document.getElementById('statCalls').textContent = callsToday;
    if (document.getElementById('statCallbacks')) document.getElementById('statCallbacks').textContent = callbacks;
    if (document.getElementById('statInterested')) document.getElementById('statInterested').textContent = interested;
  }

  function renderSetupRequired(error) {
    const main = document.querySelector('main.content');
    if (!main) return;
    const page = document.title;
    if (!['Earnings','Account','Settings'].includes(page)) return;

    if (page === 'Earnings') {
      const state = document.getElementById('earningsState');
      if (state) {
        state.style.display = '';
        state.innerHTML = '<strong>Live data is unavailable.</strong><div class="cc-muted" style="margin-top:6px">' + esc(error?.message || 'Unable to connect to the earnings tables.') + '</div>';
      }
      return;
    }

    main.innerHTML = `
      <section class="cc-live-card" style="text-align:center;padding:24px 18px">
        <i data-lucide="database-zap" style="width:34px;height:34px;color:#d27b20"></i>
        <h3 style="margin:10px 0 6px">Live data setup required</h3>
        <p class="cc-muted" style="margin:0">This page is connected to Supabase, but the call-center tables are not available yet.</p>
      </section>`;
    window.lucide?.createIcons();
  }

  async function init() {
    addStyles();
    const { session, profile, schemaReady, schemaError } = await getSessionAndProfile();
    if (!session) return;
    if (!schemaReady || !profile) {
      renderSetupRequired(schemaError);
      return;
    }

    await maybePromptDeviceNotifications();
    await maybeSendAccountActivityNotification(profile);

    const state = activityState(profile);
    if (state.label === 'Disabled') {
      showDisabled(profile);
      return;
    }

    await showOnboarding(session, profile);
    if (!profile.onboarding_completed) return;

    await Promise.all([
      loadEarnings(session, profile),
      loadAccount(session, profile),
      loadActivity(session, profile),
      loadPersonalOutreachStats(session)
    ]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();