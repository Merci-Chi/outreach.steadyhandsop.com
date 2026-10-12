const q = (s, root = document) => root.querySelector(s);

const qa = (s, root = document) => [...root.querySelectorAll(s)];

function refreshIcons() {

  if (window.lucide) lucide.createIcons();

}

function showToast(message) {

  let toast = q('.app-toast');

  if (!toast) {

    toast = document.createElement('div');

    toast.className = 'app-toast';

    document.body.appendChild(toast);

  }

  toast.textContent = message;

  toast.classList.add('show');

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);

}


const CALLCENTER_VAPID_PUBLIC_KEY = 'BKV1zdb8AEVnr3llXN6L9a0PsxrkBA-A13xswxHpOIQPTMbtZ-SeTrt_cyM3xBmT30pZV8mxSziuWnDg6QgfrL0';

function callcenterUrlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function callcenterSyncPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;

  const client = window.steadyHandsCRMClient;
  if (!client) return false;

  try {
    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError) throw authError;
    const user = authData?.session?.user;
    if (!user) return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: callcenterUrlBase64ToUint8Array(CALLCENTER_VAPID_PUBLIC_KEY)
      });
    }

    const json = subscription.toJSON();
    const endpoint = json.endpoint || subscription.endpoint;
    const p256dh = json.keys?.p256dh || '';
    const auth = json.keys?.auth || '';

    if (!endpoint || !p256dh || !auth) {
      throw new Error('Push subscription is missing required keys.');
    }

    const { error } = await client
      .from('callcenter_push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString()
      }, { onConflict:'user_id,endpoint' });

    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Unable to sync push subscription:', error);
    return false;
  }
}

function callcenterPadCalendar(value) {
  return String(value).padStart(2, '0');
}

function callcenterCalendarICS(details = {}) {
  const start = new Date(details.startsAt || Date.now());
  const end = new Date(start.getTime() + 30 * 60000);
  const fmt = date =>
    `${date.getFullYear()}${callcenterPadCalendar(date.getMonth()+1)}${callcenterPadCalendar(date.getDate())}T${callcenterPadCalendar(date.getHours())}${callcenterPadCalendar(date.getMinutes())}00`;
  const esc = value => String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

  const description = [
    details.contact,
    details.number,
    details.note
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steady Hands//Outreach//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`Follow up with ${details.company || 'lead'}`)}`,
    `DESCRIPTION:${esc(description)}`,
    `UID:${details.crmId || Date.now()}-${start.getTime()}@steadyhandsop.com`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Call ${details.company || 'lead'} in 1 hour`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Call ${details.company || 'lead'} in 30 minutes`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Call ${details.company || 'lead'} in 10 minutes`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT5M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`Call ${details.company || 'lead'} in 5 minutes`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`It is time to call ${details.company || 'lead'}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

async function callcenterOpenDeviceCalendar(details = {}) {
  const ics = callcenterCalendarICS(details);

  try {
    // iPhone/iPad: do NOT use navigator.share or a download attribute.
    // Those routes open the Share Sheet instead of Calendar.
    // Navigating directly to a text/calendar resource gives iOS the
    // opportunity to hand the event to the system Calendar importer.
    const blob = new Blob([ics], { type:'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
      window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return true;
    }

    // Other devices: open the calendar resource directly first.
    const popup = window.open(url, '_blank');
    if (!popup) window.location.href = url;

    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (error) {
    console.error('Unable to open calendar event:', error);
    showToast('Could not open the device calendar');
    return false;
  }
}

async function callcenterRequestNotifications() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported on this device');
    return false;
  }

  if (Notification.permission === 'denied') {
    showToast('Notifications are blocked in device settings');
    return false;
  }

  try {
    let permission = Notification.permission;

    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      const pushReady = await callcenterSyncPushSubscription();
      showToast(pushReady ? 'Notifications enabled' : 'Notifications allowed — finishing setup');
      return true;
    }
  } catch (error) {
    console.warn('Notification permission failed:', error);
  }

  return false;
}

async function callcenterShowScheduledNotification(schedule, reminderMinutes = null) {
  if (!schedule || !('Notification' in window) || Notification.permission !== 'granted') return;

  const startsAt = new Date(schedule.startsAt);
  const company = schedule.company || 'this lead';
  const timeText = startsAt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});

  let title = 'Call scheduled for today';
  let body = `Scheduled today at ${timeText}.`;
  let reminderKey = 'today';

  if (reminderMinutes === 60) {
    title = 'Call in 1 hour';
    body = `Your call with ${company} is in 1 hour at ${timeText}.`;
    reminderKey = '60m';
  } else if (reminderMinutes === 30) {
    title = 'Call in 30 minutes';
    body = `Your call with ${company} is in 30 minutes at ${timeText}.`;
    reminderKey = '30m';
  } else if (reminderMinutes === 10) {
    title = 'Call in 10 minutes';
    body = `Your call with ${company} is in 10 minutes at ${timeText}.`;
    reminderKey = '10m';
  } else if (reminderMinutes === 5) {
    title = 'Call in 5 minutes';
    body = `Your call with ${company} is in 5 minutes at ${timeText}.`;
    reminderKey = '5m';
  } else if (reminderMinutes === 0) {
    title = 'Scheduled call is due';
    body = `It's time to call ${company}.`;
    reminderKey = 'now';
  }

  try {
    const options = {
      body,
      icon:'images/icon-192.png',
      badge:'images/icon-192.png',
      tag:`scheduled-call-${schedule.crmId || schedule.startsAt}-${reminderKey}`,
      renotify:true,
      data:{ url: schedule.crmId ? `index.html?crm_id=${encodeURIComponent(schedule.crmId)}` : 'index.html' }
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    }

    new Notification(title, options);
  } catch (error) {
    console.warn('Unable to show scheduled notification:', error);
  }
}

function modal(title, body, actions = [{ label: 'Done', primary: true }]) {

  q('.app-modal-overlay')?.remove();

  const overlay = document.createElement('div');

  overlay.className = 'app-modal-overlay';

  overlay.innerHTML = `

    <div class="app-modal" role="dialog" aria-modal="true" aria-label="${title}">

      <div class="app-modal-head">

        <h3>${title}</h3>

        <button class="app-modal-close" aria-label="Close"><i data-lucide="x"></i></button>

      </div>

      <div class="app-modal-body">${body}</div>

      <div class="app-modal-actions"></div>

    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  q('.app-modal-close', overlay).addEventListener('click', close);

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const row = q('.app-modal-actions', overlay);

  actions.forEach(action => {

    const btn = document.createElement('button');

    btn.className = `modal-action${action.primary ? ' primary' : ''}${action.danger ? ' danger' : ''}`;

    btn.textContent = action.label;

    btn.addEventListener('click', () => {

      if (action.onClick) action.onClick(close, overlay);

      else close();

    });

    row.appendChild(btn);

  });

  refreshIcons();

  return overlay;

}

function cycleButton(btn, values) {

  const current = btn.dataset.value || values[0];

  const next = values[(values.indexOf(current) + 1) % values.length];

  btn.dataset.value = next;

  btn.textContent = `${next}⌄`;

  showToast(`Showing ${next.toLowerCase()}`);

}

function setupCopyButtons() {

  qa('[data-copy]').forEach(btn => {

    btn.addEventListener('click', async () => {

      const value = btn.getAttribute('data-copy') || '';

      try { await navigator.clipboard.writeText(value); } catch {}

      const old = btn.innerHTML;

      btn.innerHTML = '<i data-lucide="check"></i>';

      refreshIcons();

      showToast('Copied');

      setTimeout(() => { btn.innerHTML = old; refreshIcons(); }, 1000);

    });

  });

}

function callcenterShuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function selectedLeadSkeletonMarkup() {
  return `
    <div class="skeleton-lead skeleton-expanded selected-lead-skeleton" aria-hidden="true">
      <div class="sk-row">
        <div class="sk-shape sk-icon"></div>
        <div class="sk-grow">
          <div class="sk-shape sk-title"></div>
          <div class="sk-shape sk-subtitle"></div>
        </div>
        <div class="sk-shape sk-star"></div>
      </div>
      <div class="sk-shape sk-phone"></div>
      <div class="sk-shape sk-line"></div>
      <div class="sk-chips"><span class="sk-shape"></span><span class="sk-shape"></span></div>
      <div class="sk-shape sk-preview"></div>
      <div class="sk-shape sk-note"></div>
      <div class="sk-shape sk-call"></div>
      <div class="sk-chips sk-bottom"><span class="sk-shape"></span><span class="sk-shape"></span><span class="sk-shape"></span></div>
    </div>`;
}

function showSelectedLeadSkeleton() {
  const box = q('#selectedLeadTop');
  if (!box) return;
  box.innerHTML = selectedLeadSkeletonMarkup();
}


async function callcenterGetPhoneApprovalClient() {
  if (window.steadyHandsCRMClient) return window.steadyHandsCRMClient;
  if (!window.supabase) return null;
  window.steadyHandsCRMClient = window.supabase.createClient(SH_SUPABASE_URL, SH_PUBLISHABLE_KEY);
  return window.steadyHandsCRMClient;
}

function callcenterPhoneApprovalModal(title, body, actions = [{label:'Close'}]) {
  return modal(title, body, actions);
}

async function callcenterFunctionErrorMessage(error, fallback) {
  try {
    const response = error?.context;
    if (response && typeof response.clone === 'function') {
      const data = await response.clone().json();
      if (data?.error) return String(data.error);
      if (data?.message) return String(data.message);
    }
  } catch {}

  const message = String(error?.message || '').trim();
  if (message && !/non-2xx status code/i.test(message)) return message;
  return fallback;
}

async function callcenterEnsurePhoneApproved() {
  const client = await callcenterGetPhoneApprovalClient();
  if (!client) {
    showToast('Unable to check phone verification');
    return false;
  }

  const { data:{ session } = {}, error: sessionError } = await client.auth.getSession();
  if (sessionError || !session?.user) {
    showToast('Please sign in again');
    return false;
  }

  const loadProfile = async () => {
    const { data, error } = await client
      .from('callcenter_profiles')
      .select('phone,phone_verified_at,phone_approval_status,phone_approval_requested_at,phone_approved_at')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data || {};
  };

  let profile;
  try {
    profile = await loadProfile();
  } catch (error) {
    console.error('Unable to load phone verification status:', error);
    callcenterPhoneApprovalModal(
      'Phone verification unavailable',
      '<p class="modal-help">Your phone verification status could not be checked. Please try again.</p>'
    );
    return false;
  }

  if (profile.phone && profile.phone_verified_at && profile.phone_approval_status === 'approved') {
    return true;
  }

  if (profile.phone_verified_at && profile.phone_approval_status === 'pending') {
    callcenterPhoneApprovalModal(
      'Waiting for admin approval',
      `<p class="modal-help">Your phone number <strong>${crmEscape(profile.phone || '')}</strong> has been verified by text message.</p>
       <p class="modal-note">An admin must approve this number before you can place calls.</p>`
    );
    return false;
  }

  const openVerifyCode = phone => {
    callcenterPhoneApprovalModal(
      'Enter verification code',
      `<p class="modal-help">We sent a 6-digit code to <strong>${crmEscape(phone)}</strong>.</p>
       <label class="modal-label">Verification code
         <input class="modal-input" id="verifyPhoneCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000">
       </label>
       <div class="modal-note" id="verifyCodeMessage">Enter the code from the text message.</div>`,
      [
        {
          label:'Back',
          onClick:(close) => {
            close();
            openVerifyNumber();
          }
        },
        {
          label:'Verify',
          primary:true,
          onClick:async (close, overlay) => {
            const codeInput = overlay.querySelector('#verifyPhoneCode');
            const message = overlay.querySelector('#verifyCodeMessage');
            const verifyButton = overlay.querySelector('.modal-action.primary');
            const code = String(codeInput?.value || '').replace(/\D/g,'').slice(0,6);

            if (code.length !== 6) {
              if (message) message.textContent = 'Enter the 6-digit code.';
              return;
            }

            if (verifyButton) {
              verifyButton.disabled = true;
              verifyButton.textContent = 'Verifying…';
            }
            if (message) message.textContent = 'Checking your code…';

            const { data, error } = await client.functions.invoke('twilio-phone-verify-code', {
              body:{ phone, code }
            });

            if (error || !data?.ok) {
              console.error('Unable to verify phone code:', error || data);
              const errorText = data?.error || await callcenterFunctionErrorMessage(
                error,
                'That code could not be verified.'
              );
              if (message) message.textContent = errorText;
              if (verifyButton) {
                verifyButton.disabled = false;
                verifyButton.textContent = 'Verify';
              }
              return;
            }

            close();
            profile = {
              ...profile,
              phone:data.phone || phone,
              phone_verified_at:data.phone_verified_at || new Date().toISOString(),
              phone_approval_status:'pending'
            };

            callcenterPhoneApprovalModal(
              'Phone verified',
              `<p class="modal-help">Your phone number <strong>${crmEscape(profile.phone)}</strong> has been verified.</p>
               <p class="modal-note">Your number is now waiting for admin approval. You will not be able to place calls until it is approved.</p>`
            );
          }
        }
      ]
    );
  };

  const openVerifyNumber = () => {
    const currentPhone = profile.phone || '';

    callcenterPhoneApprovalModal(
      'Verify phone number',
      `<p class="modal-help">Before you can make calls, verify your phone number by SMS. After verification, an admin must approve it.</p>
       <label class="modal-label">Phone number
         <input class="modal-input" id="verifyPhoneNumber" type="tel" inputmode="tel" autocomplete="tel" placeholder="(702) 555-0123" value="${crmEscape(currentPhone)}">
       </label>
       <div class="modal-note" id="verifyPhoneMessage">We will text a 6-digit verification code to this number.</div>`,
      [
        {label:'Cancel'},
        {
          label:'Send Code',
          primary:true,
          onClick:async (close, overlay) => {
            const phoneInput = overlay.querySelector('#verifyPhoneNumber');
            const message = overlay.querySelector('#verifyPhoneMessage');
            const sendButton = overlay.querySelector('.modal-action.primary');
            const phone = String(phoneInput?.value || '').trim();
            const digits = phone.replace(/\D/g,'');

            if (digits.length < 10) {
              if (message) message.textContent = 'Enter a valid phone number first.';
              return;
            }

            if (sendButton) {
              sendButton.disabled = true;
              sendButton.textContent = 'Sending…';
            }
            if (message) message.textContent = 'Sending verification code…';

            const { data, error } = await client.functions.invoke('twilio-phone-send-code', {
              body:{ phone }
            });

            if (error || !data?.ok) {
              console.error('Unable to send phone code:', error || data);
              const errorText = data?.error || await callcenterFunctionErrorMessage(
                error,
                'Unable to send the verification code.'
              );
              if (message) message.textContent = errorText;
              if (sendButton) {
                sendButton.disabled = false;
                sendButton.textContent = 'Send Code';
              }
              return;
            }

            close();
            openVerifyCode(data.phone || phone);
          }
        }
      ]
    );
  };

  if (profile.phone_approval_status === 'rejected') {
    callcenterPhoneApprovalModal(
      'Phone number not approved',
      `<p class="modal-help">Your previously submitted phone number was not approved.</p>
       <p class="modal-note">Verify a different phone number to submit a new approval request.</p>`,
      [
        {label:'Close'},
        {
          label:'Verify New Number',
          primary:true,
          onClick:(close) => {
            close();
            openVerifyNumber();
          }
        }
      ]
    );
    return false;
  }

  openVerifyNumber();
  return false;
}

function setupOutreach() {

  const leadContainer = q('#crmLeadCards');
  const selectedLeadTop = q('#selectedLeadTop');
  if (!leadContainer) return;

  // Only treat cards inside the real results container as the searchable queue.
  // Cards in selectedLeadTop must never become the parent for search results.
  const leadCards = qa('.lead-card', leadContainer);

  if (!leadCards.length) return;

  const originalOrder = [...leadCards];
  const isSearchMode = () => {
    const query = (q('#crmSearch')?.value || '').trim();
    return !!query || (typeof crmSearchState !== 'undefined' && (crmSearchState.tags?.size > 0 || crmSearchState.sources?.size > 0));
  };

  let activeFilter = crmSearchState?.mainFilter || 'All';

  // Keep the explicitly chosen lead across page changes and reloads.
  const savedLeadId = (() => { try { return sessionStorage.getItem('steadyhands-selected-outreach-crm-id') || ''; } catch { return ''; } })();
  let selectedCard = originalOrder.find(card => card.dataset.crmId === window.steadyHandsForcedCRMId)
    || originalOrder.find(card => card.dataset.crmId === savedLeadId)
    || (selectedLeadTop?.querySelector('.lead-card') || null);

  window.steadyHandsForcedCRMId = null;

  let leadSort = 'hours';

  let navigationQueue = [];

  let queueTransition = false;

  let queuePending = null;

  const SKELETON_DELAY = 220;

  const compactSkeleton = height => `

    <div class="skeleton-lead skeleton-compact" style="height:${height}px" aria-hidden="true">

      <div class="sk-row">

        <div class="sk-shape sk-icon"></div>

        <div class="sk-grow">

          <div class="sk-shape sk-title"></div>

          <div class="sk-shape sk-subtitle"></div>

        </div>

        <div class="sk-shape sk-star"></div>

      </div>

      <div class="sk-shape sk-phone"></div>

    </div>`;

  const expandedSkeleton = height => `

    <div class="skeleton-lead skeleton-expanded" style="height:${height}px" aria-hidden="true">

      <div class="sk-row">

        <div class="sk-shape sk-icon"></div>

        <div class="sk-grow">

          <div class="sk-shape sk-title"></div>

          <div class="sk-shape sk-subtitle"></div>

        </div>

        <div class="sk-shape sk-star"></div>

      </div>

      <div class="sk-shape sk-phone"></div>

      <div class="sk-chips"><span class="sk-shape"></span><span class="sk-shape"></span><span class="sk-shape"></span></div>

      <div class="sk-shape sk-line"></div>

      <div class="sk-shape sk-line short"></div>

      <div class="sk-shape sk-preview"></div>

      <div class="sk-shape sk-note"></div>

      <div class="sk-shape sk-call"></div>

      <div class="sk-chips sk-bottom"><span class="sk-shape"></span><span class="sk-shape"></span><span class="sk-shape"></span></div>

    </div>`;

  function skeletonMarkup() {

    return [...leadContainer.children]

      .filter(el => {

        if (el.classList.contains('lead-skeleton-overlay')) return false;

        const style = getComputedStyle(el);

        return style.display !== 'none' && style.visibility !== 'hidden';

      })

      .map(el => {

        const height = Math.max(1, Math.ceil(el.getBoundingClientRect().height));

        if (el.classList.contains('lead-sort-control')) {

          return `<div class="skeleton-sort" style="height:${height}px" aria-hidden="true"><span class="sk-shape"></span><span class="sk-shape"></span></div>`;

        }

        if (el.classList.contains('lead-card')) {

          return el.classList.contains('selected-lead')

            ? expandedSkeleton(height)

            : compactSkeleton(height);

        }

        return '';

      })

      .join('');

  }

  function changeLeads(update) {

    if (queueTransition) { queuePending = update; return; }

    queueTransition = true;

    const previousHeight = Math.ceil(leadContainer.getBoundingClientRect().height);

    const markup = skeletonMarkup();

    leadContainer.style.minHeight = `${previousHeight}px`;

    leadContainer.classList.add('leads-switching');

    leadContainer.setAttribute('aria-busy','true');

    const overlay = document.createElement('div');

    overlay.className = 'lead-skeleton-overlay';

    overlay.innerHTML = markup;

    leadContainer.appendChild(overlay);

    // Never replace the selected lead during queue transitions.

    refreshIcons();

    window.setTimeout(() => {

      try { update(); } catch(error) { console.error('Unable to change leads:', error); }

      overlay.remove();

      leadContainer.classList.remove('leads-switching');

      leadContainer.removeAttribute('aria-busy');

      leadContainer.style.minHeight = '';

      selectedLeadTop?.removeAttribute('aria-busy');

      queueTransition = false;

      if (queuePending) {

        const next = queuePending;

        queuePending = null;

        changeLeads(next);

      }

    }, SKELETON_DELAY);

  }

  const MAX_FOLLOWING = 10;

  const companyName = card => q('.lead-title h2', card)?.textContent?.trim() || 'Business';

  const starKey = card => card?.dataset.crmId || companyName(card);

  const STAR_KEY = 'steadyhands-outreach-starred-preview-ids';

  const initialStarred = originalOrder

    .filter(card => q('.star-button', card)?.classList.contains('favorite'))

    .map(starKey);

  let starredNames;

  try {

    const saved = JSON.parse(localStorage.getItem(STAR_KEY));

    starredNames = Array.isArray(saved) ? new Set(saved) : new Set(initialStarred);

  } catch {

    starredNames = new Set(initialStarred);

  }

  const syncStars = () => {

    originalOrder.forEach(card => {

      const star = q('.star-button', card);

      if (!star) return;

      const on = starredNames.has(starKey(card));

      star.classList.toggle('favorite', on);

      star.setAttribute('aria-label', on ? 'Unstar company' : 'Star company');

      star.setAttribute('aria-pressed', String(on));

    });

    localStorage.setItem(STAR_KEY, JSON.stringify([...starredNames]));

  };

  syncStars();

  const SCHEDULE_KEY = `steadyhands-outreach-scheduled-calls:${window.steadyHandsOutreachUserId || 'device'}`;
  let scheduledCalls = {};
  try {
    const savedSchedules = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}');
    scheduledCalls = savedSchedules && typeof savedSchedules === 'object' ? savedSchedules : {};
  } catch {
    scheduledCalls = {};
  }

  const syncScheduledCards = () => {
    originalOrder.forEach(card => {
      const key = starKey(card);
      card.dataset.scheduled = scheduledCalls[key] ? 'true' : 'false';
    });
  };

  const saveScheduledCall = async (card, details) => {
    const key = starKey(card);
    scheduledCalls[key] = details;
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduledCalls));
    card.dataset.scheduled = 'true';

    const client = window.steadyHandsCRMClient;
    const userId = window.steadyHandsOutreachUserId;

    if (!client || !userId) return details;

    try {
      const payload = {
        user_id: userId,
        crm_id: details.crmId || null,
        company: details.company || '',
        contact: details.contact || '',
        phone: details.number || '',
        note: details.note || '',
        starts_at: details.startsAt,
        active: true,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from('callcenter_scheduled_calls')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      details.scheduleId = data?.id || '';
      scheduledCalls[key] = details;
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduledCalls));
      return details;
    } catch (error) {
      console.warn('Unable to save scheduled call to Supabase:', error);
      showToast('Call saved on this device, but background reminders are not synced');
      return details;
    }
  };

  syncScheduledCards();

  const hydrateScheduledCallsFromSupabase = async () => {
    const client = window.steadyHandsCRMClient;
    const userId = window.steadyHandsOutreachUserId;
    if (!client || !userId) return;

    try {
      const { data = [], error } = await client
        .from('callcenter_scheduled_calls')
        .select('id,crm_id,company,contact,phone,note,starts_at,active')
        .eq('user_id', userId)
        .eq('active', true)
        .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('starts_at', { ascending:true })
        .limit(200);

      if (error) throw error;

      for (const row of data) {
        const key = String(row.crm_id || row.company || row.id);
        scheduledCalls[key] = {
          scheduleId: row.id,
          crmId: row.crm_id || '',
          company: row.company || '',
          contact: row.contact || '',
          number: row.phone || '',
          note: row.note || '',
          startsAt: row.starts_at
        };
      }

      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduledCalls));
      syncScheduledCards();
      renderQueue(false);
    } catch (error) {
      console.warn('Unable to load scheduled calls from Supabase:', error);
    }
  };

  hydrateScheduledCallsFromSupabase();

  if ('Notification' in window && Notification.permission === 'granted') {
    callcenterSyncPushSubscription();
  }

  const scheduledCallKey = schedule =>
    `${schedule.crmId || schedule.company || 'lead'}:${schedule.startsAt || ''}`;

  const sameLocalDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const findTodaySchedules = () => {
    const now = new Date();
    return Object.values(scheduledCalls)
      .filter(schedule => {
        const when = new Date(schedule?.startsAt);
        return schedule?.startsAt && !Number.isNaN(when.getTime()) && sameLocalDay(now, when);
      })
      .sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt));
  };

  const openTodaySchedulePopup = schedule => {
    if (!schedule) return;
    const when = new Date(schedule.startsAt);
    const now = new Date();
    const minutesAway = Math.round((when - now) / 60000);
    const urgent = minutesAway <= 15 && minutesAway >= -30;
    const timeText = when.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    const timingText = urgent
      ? (minutesAway > 1 ? `Your scheduled call is in ${minutesAway} minutes.` : minutesAway >= -1 ? 'Your scheduled call is due now.' : 'Your scheduled call time just passed.')
      : `You have a call scheduled for today at ${timeText}.`;

    const body = `
      <div class="scheduled-call-alert ${urgent ? 'urgent' : ''}">
        <div class="scheduled-call-alert-icon"><i data-lucide="${urgent ? 'bell-ring' : 'calendar-clock'}"></i></div>
        <strong>${crmEscape(timingText)}</strong>
        <p>${crmEscape(schedule.company || 'Scheduled lead')}</p>
        ${schedule.note ? `<small>${crmEscape(schedule.note)}</small>` : ''}
      </div>`;

    const actions = [
      {
        label:'Add to Calendar',
        onClick: async (close) => {
          await callcenterOpenDeviceCalendar(schedule);
          close();
        }
      }
    ];

    if (schedule.crmId) {
      actions.push({
        label:'Open Lead',
        primary:true,
        onClick:(close) => {
          close();
          window.location.href = `index.html?crm_id=${encodeURIComponent(schedule.crmId)}`;
        }
      });
    }

    if ('Notification' in window && Notification.permission === 'default') {
      actions.unshift({
        label:'Enable Notifications',
        onClick: async () => {
          const enabled = await callcenterRequestNotifications();
          if (enabled) callcenterShowScheduledNotification(schedule, null);
        }
      });
    }

    modal(
      urgent ? 'Scheduled call is due' : 'You have a call scheduled for today',
      body,
      actions
    );
  };

  const SCHEDULE_REMINDERS = [60, 30, 10, 5, 0];

  const checkScheduledCalls = ({ showPopup = true } = {}) => {
    const today = findTodaySchedules();
    if (!today.length) return;

    const now = new Date();

    // Show the same-day popup once per session for the next relevant call.
    const next = today.find(schedule =>
      new Date(schedule.startsAt) >= new Date(now.getTime() - 30 * 60000)
    ) || today[0];

    const popupKey = `steadyhands-schedule-popup:${scheduledCallKey(next)}:today`;
    if (showPopup && !sessionStorage.getItem(popupKey)) {
      sessionStorage.setItem(popupKey, '1');
      openTodaySchedulePopup(next);
    }

    // Fire separate notifications at 60, 30, 10, 5 and 0 minutes.
    today.forEach(schedule => {
      const when = new Date(schedule.startsAt);
      const minutesUntil = (when.getTime() - now.getTime()) / 60000;

      SCHEDULE_REMINDERS.forEach(reminderMinutes => {
        // The checker runs once a minute. A two-minute window prevents a
        // missed alert if the interval wakes a little late, while the
        // persistent key prevents duplicates after refresh/reopen.
        const shouldFire =
          minutesUntil <= reminderMinutes &&
          minutesUntil > reminderMinutes - 2;

        if (!shouldFire) return;

        const noticeKey =
          `steadyhands-schedule-reminder:${scheduledCallKey(schedule)}:${reminderMinutes}`;

        if (localStorage.getItem(noticeKey)) return;

        localStorage.setItem(noticeKey, String(Date.now()));
        callcenterShowScheduledNotification(schedule, reminderMinutes);

        if (reminderMinutes === 0 && showPopup) {
          openTodaySchedulePopup(schedule);
        }
      });
    });
  };

  checkScheduledCalls();
  if (!window.__steadyHandsScheduleTicker) {
    window.__steadyHandsScheduleTicker = setInterval(
      () => checkScheduledCalls({ showPopup:true }),
      30000
    );
  }

  const matchesFilter = card => {

    if (card.dataset.notInterested === 'true') return false;

    const query = (q('#crmSearch')?.value || '').trim().toLowerCase();

    if (query && !card.textContent.toLowerCase().includes(query)) return false;

    if (activeFilter === 'Call Backs') {
      return window.steadyHandsCalledCRMIds instanceof Set &&
        window.steadyHandsCalledCRMIds.has(String(card.dataset.crmId || ''));
    }

    if (activeFilter === 'Starred') return starredNames.has(starKey(card));

    if (activeFilter === 'Scheduled') return card.dataset.scheduled === 'true';

    return true;

  };

  const getFilteredQueue = () => originalOrder.filter(matchesFilter);

  const rankedPool = () => getFilteredQueue();

  const getOrderedCards = () => {

    const pool = rankedPool();

    if (!pool.length) { if (!isSearchMode()) selectedCard = null; return []; }

    if (isSearchMode()) return pool.filter(card => card.dataset.crmId !== selectedCard?.dataset.crmId);

    if (!selectedCard) selectedCard = selectedLeadTop?.querySelector('.lead-card') || pool[0];

    const remaining = pool.filter(card => card !== selectedCard);

    return [selectedCard, ...remaining];

  };

  const renderQueue = (shouldScroll = false) => {

    const orderedCards = getOrderedCards();
    const searching = isSearchMode();

    const visibleCards = orderedCards.slice(0, MAX_FOLLOWING + 1);

    originalOrder.forEach(card => {
      // Never hide or demote the intentionally selected lead.
      if (card === selectedCard && card.parentElement === selectedLeadTop) return;
      card.classList.remove('selected-lead');
      card.style.display = 'none';
      card.style.order = '';
    });

    if (searching) {
      // Searching only updates the ten queue cards. The selected pane is untouched.
      orderedCards.slice(0, MAX_FOLLOWING).forEach((card, index) => {
        card.style.display = '';
        card.style.order = String(index + 1);
        leadContainer.appendChild(card);
      });
    } else {
      const preserved = selectedLeadTop?.querySelector('.lead-card');
      const selected = selectedCard && selectedCard.dataset.crmId === preserved?.dataset.crmId
        ? preserved : (visibleCards[0] || preserved || null);
      const following = visibleCards.filter(card => card.dataset.crmId !== selected?.dataset.crmId).slice(0, MAX_FOLLOWING);
      if (selected && selectedLeadTop) {
        selected.style.display = '';
        selected.classList.add('selected-lead');
        selectedLeadTop.replaceChildren(selected);
        selectedCard = selected;
        if (selected.dataset.crmId) {
          try { sessionStorage.setItem('steadyhands-selected-outreach-crm-id', String(selected.dataset.crmId)); } catch {}
          document.body.classList.remove('sh-no-selected-lead');
          const empty = document.getElementById('shNoLead');
          if (empty) empty.hidden = true;
        }
      }
      following.forEach((card, index) => {
        card.style.display = '';
        card.style.order = String(index + 1);
        leadContainer.appendChild(card);
      });
    }

    originalOrder.filter(card => !visibleCards.includes(card) && card !== selectedCard)
      .forEach(card => leadContainer.appendChild(card));

    // A selected search-result card lives only in the selected pane.
    if (selectedCard && selectedCard.parentElement === selectedLeadTop) {
      selectedCard.style.display = '';
      selectedCard.classList.add('selected-lead');
    }

    refreshIcons();

  };

  const selectCard = (card, shouldScroll = true) => {

    if (!card || !matchesFilter(card)) return;

    changeLeads(() => {

    selectedCard = card;
    // Selecting a result is explicit; only this action changes the selected pane.
    if (selectedLeadTop) {
      card.style.display = '';
      selectedLeadTop.replaceChildren(card);
    }

    renderQueue(false);

    if (card.dataset.crmId) {
      window.callcenterSetResumeLocation?.(
        `index.html?crm_id=${encodeURIComponent(card.dataset.crmId)}`,
        companyName(card)
      );
    }

    });

  };

  const applyFilter = label => {

    changeLeads(() => { activeFilter = label; selectedCard = null; renderQueue(false); });

  };

  const mainFilterButton = q('#crmMainFilter');
  const mainFilterLabel = q('#crmMainFilterLabel');

  const updateMainFilterLabel = () => {
    if (mainFilterLabel) mainFilterLabel.textContent = `Filter: ${activeFilter}`;
    mainFilterButton?.classList.toggle('active', activeFilter !== 'All');
  };

  updateMainFilterLabel();

  if (mainFilterButton) {
    mainFilterButton.onclick = () => {
      const choices = [
        { value:'All', icon:'list' },
        { value:'Starred', icon:'star' },
        { value:'Scheduled', icon:'calendar-clock' },
        { value:'Call Backs', icon:'phone-call' }
      ];

      const body = `
        <div class="tag-filter-sheet">
          <p class="tag-filter-help">Choose which outreach leads you want to see.</p>
          <div class="main-filter-grid">
            ${choices.map(choice => `
              <button type="button"
                class="main-filter-choice ${activeFilter === choice.value ? 'selected' : ''}"
                data-main-filter="${choice.value}">
                <i data-lucide="${choice.icon}"></i>
                <span>${choice.value}</span>
              </button>
            `).join('')}
          </div>
        </div>`;

      const overlay = modal('Filter outreach', body, []);

      qa('[data-main-filter]', overlay).forEach(btn => {
        btn.onclick = () => {
          activeFilter = btn.dataset.mainFilter || 'All';
          crmSearchState.mainFilter = activeFilter;
          overlay.remove();
          updateMainFilterLabel();
          applyFilter(activeFilter);
          showToast(activeFilter === 'All' ? 'Showing all previews' : `Showing ${activeFilter.toLowerCase()}`);
        };
      });
    };
  }

  originalOrder.forEach(card => {

    card.addEventListener('click', e => {

      if (e.target.closest('button, a, .notes')) return;

      if (!card.classList.contains('selected-lead')) selectCard(card);

    });

  });

  originalOrder.forEach(card => {

    const notes = q('.notes', card);

    if (!notes) return;

    notes.setAttribute('role', 'button');

    notes.setAttribute('tabindex', '0');

    const openNotes = e => {

      e?.stopPropagation?.();

      const p = q('p', notes);

      const current = (p?.innerText || '').trim();

      const overlay = modal(`Notes — ${companyName(card)}`, `

        <p class="modal-help">Add or update notes for this business.</p>

        <textarea class="modal-textarea" id="lead-note-edit" placeholder="Add a note..."></textarea>`, [

        { label: 'Cancel' },

        { label: 'Save Note', primary: true, onClick: async (close, root) => {

          const value = q('#lead-note-edit', root).value.trim();

          const client = window.steadyHandsCRMClient;

          if (!client || !card.dataset.crmId) { showToast('CRM is not connected'); return; }

          const { error } = await client.from('crm').update({ notes:value }).eq('id',card.dataset.crmId);

          if (error) { console.error('Unable to save note:',error); showToast('Could not save note. Try again.'); return; }

          if (p) { p.textContent = value || 'No notes added yet.'; p.style.whiteSpace = 'pre-line'; }

          close();

          showToast('Note saved in CRM');

        }}

      ]);

      const textarea = q('#lead-note-edit', overlay);

      textarea.value = current === 'No notes added yet.' ? '' : current;

      setTimeout(() => textarea.focus(), 80);

    };

    notes.addEventListener('click', openNotes);

    notes.addEventListener('keydown', e => {

      if (e.key === 'Enter' || e.key === ' ') openNotes(e);

    });

  });

  function openCalendarSheet(card) {

    q('.calendar-sheet-overlay')?.remove();

    const now = new Date();

    const state = {

      month: now.getMonth(),

      day: now.getDate(),

      year: now.getFullYear(),

      hour: ((now.getHours() + 11) % 12) + 1,

      minute: [0,15,30,45].reduce((a,b) => Math.abs(b-now.getMinutes()) < Math.abs(a-now.getMinutes()) ? b : a, 0),

      ampm: now.getHours() >= 12 ? 'PM' : 'AM'

    };

    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const years = Array.from({length: 6}, (_,i) => now.getFullYear() + i);

    const hours = Array.from({length:12},(_,i)=>i+1);

    const minutes = [0,15,30,45];

    const overlay = document.createElement('div');

    overlay.className = 'calendar-sheet-overlay';

    overlay.innerHTML = `

      <section class="calendar-sheet" role="dialog" aria-modal="true" aria-label="Add to Calendar">

        <div class="calendar-grabber"></div>

        <div class="calendar-sheet-head">

          <h2>Add to Calendar</h2>

          <button class="calendar-close" aria-label="Close"><i data-lucide="x"></i></button>

        </div>

        <div class="calendar-progress"><span></span></div>

        <p class="calendar-lead">Choose when to follow up with <strong>${crmEscape(companyName(card))}</strong>.</p>

        <label class="calendar-label">Date</label>

        <div class="picker-row date-picker-row">

          <div class="picker-field month" data-picker="month"><button class="picker-button" type="button"><span></span><i data-lucide="chevron-down"></i></button><div class="picker-menu"></div></div>

          <div class="picker-field day" data-picker="day"><button class="picker-button" type="button"><span></span><i data-lucide="chevron-down"></i></button><div class="picker-menu"></div></div>

          <div class="picker-field year" data-picker="year"><button class="picker-button" type="button"><span></span><i data-lucide="chevron-down"></i></button><div class="picker-menu"></div></div>

        </div>

        <div class="calendar-date-preview"></div>

        <label class="calendar-label">Time</label>

        <div class="picker-row time-picker-row">

          <div class="picker-field hour" data-picker="hour"><button class="picker-button" type="button"><span></span><i data-lucide="chevron-down"></i></button><div class="picker-menu"></div></div>

          <span class="picker-separator">:</span>

          <div class="picker-field minute" data-picker="minute"><button class="picker-button" type="button"><span></span><i data-lucide="chevron-down"></i></button><div class="picker-menu"></div></div>

          <div class="picker-field ampm" data-picker="ampm"><button class="picker-button" type="button"><span></span><i data-lucide="chevron-down"></i></button><div class="picker-menu"></div></div>

        </div>

        <label class="calendar-label">Note <span style="font-weight:700;color:#91a0af">(optional)</span></label>

        <textarea class="calendar-note" placeholder="Add a note for this follow-up..."></textarea>

        <div class="calendar-actions">

          <button class="calendar-action calendar-cancel" type="button">Cancel</button>

          <button class="calendar-action primary calendar-save" type="button"><i data-lucide="calendar-plus"></i> Add to Calendar</button>

        </div>

      </section>`;

    document.body.appendChild(overlay);

    const sheet = q('.calendar-sheet', overlay);

    const pickerFields = qa('.picker-field', sheet);

    const closeMenus = except => pickerFields.forEach(f => { if (f !== except) f.classList.remove('open'); });

    const daysInMonth = () => new Date(state.year, state.month + 1, 0).getDate();

    const clampDay = () => { state.day = Math.min(state.day, daysInMonth()); };

    const pad = n => String(n).padStart(2,'0');

    const valuesFor = type => {

      if (type === 'month') return months.map((label, value) => ({label, value}));

      if (type === 'day') return Array.from({length:daysInMonth()},(_,i)=>({label:String(i+1),value:i+1}));

      if (type === 'year') return years.map(v=>({label:String(v),value:v}));

      if (type === 'hour') return hours.map(v=>({label:pad(v),value:v}));

      if (type === 'minute') return minutes.map(v=>({label:pad(v),value:v}));

      return [{label:'AM',value:'AM'},{label:'PM',value:'PM'}];

    };

    const getStateValue = type => type === 'month' ? state.month : state[type];

    const setStateValue = (type, value) => {

      if (type === 'month') state.month = Number(value);

      else if (type === 'ampm') state.ampm = value;

      else state[type] = Number(value);

      if (type === 'month' || type === 'year') clampDay();

    };

    const renderPickers = () => {

      pickerFields.forEach(field => {

        const type = field.dataset.picker;

        const buttonText = q('.picker-button span', field);

        const menu = q('.picker-menu', field);

        const vals = valuesFor(type);

        const current = getStateValue(type);

        const chosen = vals.find(x => String(x.value) === String(current)) || vals[0];

        buttonText.textContent = chosen.label;

        menu.innerHTML = '';

        vals.forEach(item => {

          const b = document.createElement('button');

          b.type = 'button';

          b.className = `picker-option${String(item.value) === String(current) ? ' selected' : ''}`;

          b.textContent = item.label;

          b.addEventListener('click', e => {

            e.stopPropagation();

            setStateValue(type, item.value);

            field.classList.remove('open');

            renderPickers();

          });

          menu.appendChild(b);

        });

      });

      q('.calendar-date-preview', sheet).textContent = `${months[state.month]} ${state.day}, ${state.year}`;

      refreshIcons();

    };

    pickerFields.forEach(field => {

      q('.picker-button', field).addEventListener('click', e => {

        e.stopPropagation();

        const open = field.classList.contains('open');

        closeMenus(field);

        field.classList.toggle('open', !open);

      });

    });

    sheet.addEventListener('click', () => closeMenus());

    const close = () => overlay.remove();

    q('.calendar-close', sheet).addEventListener('click', close);

    q('.calendar-cancel', sheet).addEventListener('click', close);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    q('.calendar-save', sheet).addEventListener('click', async () => {

      let hour24 = state.hour % 12;

      if (state.ampm === 'PM') hour24 += 12;

      const start = new Date(state.year, state.month, state.day, hour24, state.minute, 0);

      const end = new Date(start.getTime() + 30 * 60000);

      const note = q('.calendar-note', sheet).value.trim();

      const name = companyName(card);

      const contact = q('.lead-title .name', card)?.textContent?.trim() || '';

      const number = q('.contact-line span', card)?.textContent?.trim() || '';

      const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

      const esc = v => String(v).replace(/**\\\\\\**/g,'\\\\\\\\\\\\\\\\').replace(/\n/g,'\\\\\n').replace(/,/g,'\\\\\\\\,').replace(/;/g,'\\\\\\\\;');

      const scheduleDetails = {
        crmId: card.dataset.crmId || '',
        company: name,
        contact,
        number,
        date: `${months[state.month]} ${state.day}, ${state.year}`,
        time: `${pad(state.hour)}:${pad(state.minute)} ${state.ampm}`,
        startsAt: start.toISOString(),
        note
      };

      await saveScheduledCall(card, scheduleDetails);

      if ('Notification' in window && Notification.permission === 'default') {
        callcenterRequestNotifications();
      }

      close();
      showToast('Opening device calendar');
      callcenterOpenDeviceCalendar(scheduleDetails);

      if (activeFilter === 'Scheduled') {
        selectedCard = card;
        renderQueue(false);
      }

    });

    renderPickers();

  }

  qa('.quick-btn').forEach(btn => {

    const label = btn.textContent.trim().toLowerCase();

    if (label.includes('random')) btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (queueTransition) return;

    // Randomize only the assigned lead cards already loaded for this salesperson.
    const eligible = [...leadContainer.querySelectorAll('.lead-card[data-crm-id]')]
      .filter(card => card.dataset.crmId && card !== selectedCard);
    if (!eligible.length) {
      showToast('No other assigned leads are available.');
      return;
    }
    const next = eligible[Math.floor(Math.random() * eligible.length)];
    changeLeads(() => {
      selectedCard = next;
      renderQueue(false);
      if (next.dataset.crmId) {
        sessionStorage.setItem('steadyhands-selected-outreach-crm-id', next.dataset.crmId);
      }
    });
  });

  if (label.includes('next')) btn.addEventListener('click', e => {

    e.stopPropagation();

    const queue = rankedPool();

    if (!queue.length) return;

    const currentPos = selectedCard ? queue.indexOf(selectedCard) : -1;

    const nextCard = queue[(currentPos + 1 + queue.length) % queue.length];

    changeLeads(() => {
      selectedCard = nextCard;
      renderQueue(false);
      if (nextCard?.dataset.crmId) {
        window.callcenterSetResumeLocation?.(
          `index.html?crm_id=${encodeURIComponent(nextCard.dataset.crmId)}`,
          companyName(nextCard)
        );
      }
    });

  });

  if (label.includes('calendar')) btn.addEventListener('click', e => {

      e.stopPropagation();

      const card = btn.closest('.lead-card') || selectedCard || getOrderedCards()[0];

      if (card) openCalendarSheet(card);

    });

  });

  qa('[data-select-lead]').forEach(btn => {

    btn.addEventListener('click', async e => {

      e.stopPropagation();

      const card = btn.closest('.lead-card');

      if (card?.dataset.notInterested === 'true') {
        showToast('This client is listed as not interested');
        return;
      }

      const company = companyName(card);

      const contact = q('.lead-title .name', card)?.textContent?.trim() || '';

      const number = q('.contact-line span', card)?.textContent?.trim() || '';

      const role = q('.lead-title .role', card)?.textContent?.trim() || '';

      const preview = card.dataset.previewUrl || q('.preview-link', card)?.href || '';

      const params = new URLSearchParams({
        company,
        contact,
        number,
        role,
        preview,
        crm_id: card.dataset.crmId || '',
        timezone: card.dataset.timezone || ''
      });

      params.set('build', '20261003-mic-permission-2');

      const callHref = `call.html?${params.toString()}`;
      window.callcenterSetResumeLocation?.(callHref, company);
      window.location.href = callHref;

    });

  });

  qa('.star-button').forEach(star => {

    const toggle = e => {

      e?.stopPropagation?.();

      const card = star.closest('.lead-card');

      const name = starKey(card);

      const currentCard = q('.lead-card.selected-lead');

      if (starredNames.has(name)) starredNames.delete(name);

      else starredNames.add(name);

      syncStars();

      showToast(starredNames.has(name) ? 'Company starred' : 'Company unstarred');

    if (currentCard) selectedCard = currentCard;

    changeLeads(() => renderQueue(false));

  };

    star.addEventListener('click', toggle);

  });

  renderQueue(false);

}

function setupSkills() {
  const tabs = qa('.tabs a');
  if (!tabs.length) return;

  const main = q('main.content');
  const original = main.innerHTML;

  const escapeSkill = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));

  const formatDuration = seconds => {
    const total = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatTranscriptTimestamp = seconds => {
    const total = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')}`;
  };

  const formatCallDate = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {
      month:'short',
      day:'numeric',
      hour:'numeric',
      minute:'2-digit'
    });
  };

  const relativeCallTime = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatCallDate(value);
  };

  const positiveOutcome = outcome => {
    const text = String(outcome || '').toLowerCase();
    if (!text) return false;
    if (/not interested|no answer|left voicemail|busy|wrong number|do not call|didn't call|did not call/.test(text)) return false;
    return /interested|call back|callback|needs more info|send preview|requested email|requested text|decision maker|hot lead|conversion|sold/.test(text);
  };

  const practice = `
    <section class="card light-card skill-placeholder">
      <div class="skill-big-icon"><i data-lucide="messages-square"></i></div>
      <h3>Practice Objections</h3>
      <p>Choose a situation and practice your response.</p>
      <button class="practice-btn" data-practice="I already have a website">I already have a website</button>
      <button class="practice-btn" data-practice="I'm not interested">I'm not interested</button>
      <button class="practice-btn" data-practice="How much does it cost?">How much does it cost?</button>
    </section>`;

  const libraryShell = `
    <section class="card light-card skill-library-card">
      <div class="skill-library-heading">
        <div>
          <div class="skill-library-title"><i data-lucide="book-open"></i><h3>Call Library</h3></div>
          <p>Review transcripts from your completed calls.</p>
        </div>
      </div>
      <div class="skill-library-list" id="skillLibraryList">
        <div class="skill-library-loading">
          <span class="skill-library-skeleton"></span>
          <span class="skill-library-skeleton"></span>
          <span class="skill-library-skeleton"></span>
        </div>
      </div>
    </section>`;

  let transcriptRows = [];
  let feedbackByTranscript = new Map();
  let libraryLoaded = false;
  let insightsLoaded = false;
  let currentRange = 7;

  const getSkillsClient = () =>
    window.steadyHandsCRMClient ||
    (window.supabase ? window.supabase.createClient(SH_SUPABASE_URL, SH_PUBLISHABLE_KEY) : null);

  function renderTranscriptModal(row) {
    let segments = row?.segments;

    if (typeof segments === 'string') {
      try { segments = JSON.parse(segments); } catch { segments = []; }
    }

    if (!Array.isArray(segments)) segments = [];

    const finalSegments = segments
      .filter(segment => segment && String(segment.text || '').trim())
      .map(segment => ({
        speaker: String(segment.speaker || 'user'),
        start_seconds: Math.max(0, Number(segment.start_seconds) || 0),
        text: String(segment.text || '').trim()
      }));

    const transcriptBody = finalSegments.length
      ? finalSegments.map(segment => {
          const isUser = segment.speaker === 'user';
          return `
            <div class="skill-transcript-line">
              <div class="skill-transcript-meta">
                <strong>${isUser ? 'You' : escapeSkill(segment.speaker)}</strong>
                <span>${formatTranscriptTimestamp(segment.start_seconds)}</span>
              </div>
              <div class="skill-transcript-bubble">${escapeSkill(segment.text)}</div>
            </div>`;
        }).join('')
      : row?.transcript
        ? `<div class="skill-transcript-plain">${escapeSkill(row.transcript).replace(/\n/g, '<br>')}</div>`
        : '<div class="skill-library-empty">No transcript text was captured for this call.</div>';

    const details = [
      row?.company ? escapeSkill(row.company) : 'Call Transcript',
      formatCallDate(row?.created_at),
      formatDuration(row?.duration_seconds)
    ].filter(Boolean).join(' · ');

    const feedback = feedbackByTranscript.get(String(row?.id || '')) || null;
    const strengths = Array.isArray(feedback?.strengths) ? feedback.strengths : [];
    const improvements = Array.isArray(feedback?.improvements) ? feedback.improvements : [];
    const scores = feedback?.scores && typeof feedback.scores === 'object' ? feedback.scores : {};

    const scoreLabels = {
      opening: 'Opening',
      questions: 'Questions',
      pricing: 'Pricing',
      objection_handling: 'Objection Handling',
      closing: 'Closing'
    };

    const coachingBlock = feedback ? `
      <section class="skill-coaching-card">
        <div class="skill-coaching-head">
          <div>
            <span>Call Coaching</span>
            <strong>${escapeSkill(feedback.sentiment || 'neutral')} sentiment</strong>
          </div>
          <i data-lucide="sparkles"></i>
        </div>

        ${feedback.summary ? `<p class="skill-coaching-summary">${escapeSkill(feedback.summary)}</p>` : ''}

        <div class="skill-score-grid">
          ${Object.entries(scoreLabels).map(([key,label]) => {
            const value = Math.max(0, Math.min(100, Number(scores?.[key]) || 0));
            return `
              <div class="skill-score">
                <div><span>${label}</span><strong>${value}</strong></div>
                <div class="skill-score-track"><span style="width:${value}%"></span></div>
              </div>`;
          }).join('')}
        </div>

        <div class="skill-coaching-columns">
          <div>
            <h4><i data-lucide="circle-check"></i> Strengths</h4>
            ${strengths.length
              ? `<ul>${strengths.map(item => `<li>${escapeSkill(item)}</li>`).join('')}</ul>`
              : '<p>No specific strengths were returned.</p>'}
          </div>
          <div>
            <h4><i data-lucide="target"></i> Improve Next</h4>
            ${improvements.length
              ? `<ul>${improvements.map(item => `<li>${escapeSkill(item)}</li>`).join('')}</ul>`
              : '<p>No specific improvements were returned.</p>'}
          </div>
        </div>
      </section>`
      : `
      <section class="skill-coaching-card skill-coaching-pending">
        <div class="skill-coaching-head">
          <div>
            <span>Call Coaching</span>
            <strong>Analysis pending</strong>
          </div>
          <i data-lucide="clock-3"></i>
        </div>
        <p class="skill-coaching-summary">Coaching feedback has not been generated for this transcript yet.</p>
      </section>`;

    modal(
      row?.company ? escapeSkill(row.company) : 'Full Transcript',
      `
        <div class="skill-transcript-detail">
          <div class="skill-transcript-summary">
            <strong>${details}</strong>
            ${row?.outcome ? `<span>${escapeSkill(row.outcome)}</span>` : ''}
          </div>
          ${coachingBlock}
          <div class="skill-transcript-lines">${transcriptBody}</div>
        </div>`
    );
  }

  async function fetchTranscriptRows() {
    if (libraryLoaded) return transcriptRows;

    const client = getSkillsClient();
    if (!client) throw new Error('Unable to connect.');

    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError) throw authError;

    const userId = authData?.session?.user?.id;
    if (!userId) {
      window.location.replace('login.html');
      return [];
    }

    const [
      { data: transcripts, error: transcriptError },
      { data: feedbackRows, error: feedbackError }
    ] = await Promise.all([
      client
        .from('callcenter_transcripts')
        .select('id,crm_id,call_activity_id,company,contact,phone,started_at,ended_at,duration_seconds,transcript,segments,outcome,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending:false })
        .limit(500),
      client
        .from('callcenter_call_feedback')
        .select('id,transcript_id,summary,strengths,improvements,sentiment,scores,created_at,updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending:false })
        .limit(500)
    ]);

    if (transcriptError) throw transcriptError;
    if (feedbackError) throw feedbackError;

    transcriptRows = Array.isArray(transcripts) ? transcripts : [];
    feedbackByTranscript = new Map(
      (Array.isArray(feedbackRows) ? feedbackRows : [])
        .map(row => [String(row.transcript_id), row])
    );

    libraryLoaded = true;
    return transcriptRows;
  }

  function filteredInsightRows() {
    if (currentRange === 'all') return [...transcriptRows];
    const days = Number(currentRange) || 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return transcriptRows.filter(row => {
      const date = new Date(row.created_at);
      return !Number.isNaN(date.getTime()) && date.getTime() >= cutoff;
    });
  }

  function renderInsights() {
    const grid = q('#skillsInsightGrid');
    const recent = q('#skillsRecentCalls');
    if (!grid || !recent) return;

    const rows = filteredInsightRows();
    const callsReviewed = rows.length;
    const totalSeconds = rows.reduce((sum, row) => sum + Math.max(0, Number(row.duration_seconds) || 0), 0);
    const avgSeconds = callsReviewed ? Math.round(totalSeconds / callsReviewed) : 0;
    const positiveCount = rows.filter(row => positiveOutcome(row.outcome)).length;
    const positivePercent = callsReviewed ? Math.round((positiveCount / callsReviewed) * 100) : 0;

    grid.innerHTML = `
      <div class="insight">
        <strong>${callsReviewed}</strong>
        <span>Calls Reviewed</span>
        <em>${callsReviewed === 1 ? '1 saved call' : `${callsReviewed} saved calls`}</em>
      </div>
      <div class="insight">
        <strong>${formatDuration(avgSeconds)}</strong>
        <span>Avg. Call Length</span>
        <em>${callsReviewed ? 'Connected time' : 'No calls yet'}</em>
      </div>
      <div class="insight">
        <strong>${positivePercent}%</strong>
        <span>Positive Outcomes</span>
        <em>${positiveCount} of ${callsReviewed}</em>
      </div>`;

    const recentRows = rows.slice(0, 5);

    if (!recentRows.length) {
      recent.innerHTML = `
        <div class="skill-library-empty">
          <i data-lucide="phone-call"></i>
          <strong>No calls in this period</strong>
          <p>Complete a call and it will show up here.</p>
        </div>`;
      refreshIcons();
      return;
    }

    recent.innerHTML = recentRows.map(row => {
      const good = positiveOutcome(row.outcome);
      const feedback = feedbackByTranscript.get(String(row.id)) || null;
      const sentiment = String(feedback?.sentiment || '').toLowerCase();
      const iconClass = sentiment === 'positive' ? 'green' : sentiment === 'negative' ? 'orange' : 'blue';
      const iconName = feedback ? 'sparkles' : (good ? 'circle-check' : 'phone-call');
      const detail = feedback?.summary
        ? feedback.summary
        : `${row.outcome || 'Call completed'} · ${formatDuration(row.duration_seconds)}`;

      return `
        <button class="feedback skill-recent-call" type="button" data-insight-transcript-id="${escapeSkill(row.id)}">
          <div class="feedback-icon ${iconClass}">
            <i data-lucide="${iconName}"></i>
          </div>
          <div>
            <strong>${escapeSkill(row.company || 'Business')}</strong>
            <p>${escapeSkill(detail)}</p>
            ${feedback ? `<small class="skill-feedback-status">${escapeSkill(sentiment || 'neutral')} coaching</small>` : ''}
          </div>
          <time>${escapeSkill(relativeCallTime(row.created_at))}</time>
        </button>`;
    }).join('');

    qa('[data-insight-transcript-id]', recent).forEach(button => {
      button.addEventListener('click', () => {
        const row = transcriptRows.find(item => String(item.id) === String(button.dataset.insightTranscriptId));
        if (row) renderTranscriptModal(row);
      });
    });

    refreshIcons();
  }

  async function loadInsights({ force = false } = {}) {
    if (insightsLoaded && !force) {
      renderInsights();
      return;
    }

    const grid = q('#skillsInsightGrid');
    const recent = q('#skillsRecentCalls');

    try {
      await fetchTranscriptRows();
      insightsLoaded = true;
      renderInsights();
    } catch (error) {
      console.error('Unable to load Skills insights:', error);

      if (grid) {
        grid.innerHTML = `
          <div class="insight"><strong>—</strong><span>Calls Reviewed</span><em>Unavailable</em></div>
          <div class="insight"><strong>—</strong><span>Avg. Call Length</span><em>Unavailable</em></div>
          <div class="insight"><strong>—</strong><span>Positive Outcomes</span><em>Unavailable</em></div>`;
      }

      if (recent) {
        recent.innerHTML = '<div class="skill-library-empty"><strong>Unable to load call insights.</strong><p>Please refresh and try again.</p></div>';
      }
    }
  }

  function renderLibraryRows(rows) {
    const list = q('#skillLibraryList');
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = `
        <div class="skill-library-empty">
          <i data-lucide="phone-call"></i>
          <strong>No saved transcripts yet</strong>
          <p>Complete a call with Live Transcript enabled and it will appear here.</p>
        </div>`;
      refreshIcons();
      return;
    }

    list.innerHTML = rows.map(row => {
      const company = escapeSkill(row.company || 'Business');
      const contact = escapeSkill(row.contact || '');
      const date = formatCallDate(row.created_at);
      const duration = formatDuration(row.duration_seconds);
      const outcome = escapeSkill(row.outcome || 'Call completed');
      const feedback = feedbackByTranscript.get(String(row.id)) || null;

      return `
        <button class="skill-library-row" type="button" data-transcript-id="${escapeSkill(row.id)}">
          <span class="skill-library-row-icon"><i data-lucide="file-text"></i></span>
          <span class="skill-library-row-copy">
            <strong>${company}</strong>
            ${contact ? `<span>${contact}</span>` : ''}
            <small>${escapeSkill(date)} · ${duration}</small>
            <em>${outcome}</em>
            ${feedback ? `<small class="skill-library-coaching"><i data-lucide="sparkles"></i> Coaching ready</small>` : ''}
          </span>
          <i class="skill-library-chevron" data-lucide="chevron-right"></i>
        </button>`;
    }).join('');

    qa('[data-transcript-id]', list).forEach(button => {
      button.addEventListener('click', () => {
        const row = transcriptRows.find(item => String(item.id) === String(button.dataset.transcriptId));
        if (row) renderTranscriptModal(row);
      });
    });

    refreshIcons();
  }

  async function loadLibrary({ force = false } = {}) {
    const list = q('#skillLibraryList');
    if (!list) return;

    try {
      if (force) {
        libraryLoaded = false;
        insightsLoaded = false;
      }

      const rows = await fetchTranscriptRows();
      renderLibraryRows(rows);
    } catch (error) {
      console.error('Unable to load Skills call library:', error);
      list.innerHTML = `
        <div class="skill-library-empty">
          <i data-lucide="triangle-alert"></i>
          <strong>Unable to load your transcripts</strong>
          <p>Please refresh and try again.</p>
        </div>`;
      refreshIcons();
    }
  }

  function setupInsightsRangeSelector() {
    const btn = q('#skillsRangeSelect');
    if (!btn || btn.dataset.skillSelectorReady === 'true') return;

    btn.dataset.skillSelectorReady = 'true';

    const choices = [
      { value:7, label:'Last 7 days' },
      { value:30, label:'Last 30 days' },
      { value:'all', label:'All time' }
    ];

    btn.addEventListener('click', () => {
      const currentIndex = choices.findIndex(choice => String(choice.value) === String(currentRange));
      const next = choices[(currentIndex + 1) % choices.length];
      currentRange = next.value;
      btn.dataset.range = String(next.value);
      btn.textContent = `${next.label}⌄`;
      renderInsights();
    });
  }

  const wireDynamic = () => {
    qa('[data-practice]').forEach(btn => btn.addEventListener('click', () => {
      modal(
        'Practice Prompt',
        `<p class="modal-help"><strong>Customer:</strong> “${escapeSkill(btn.dataset.practice)}”</p><textarea class="modal-textarea" placeholder="Type how you would respond..."></textarea>`,
        [
          { label: 'Close' },
          {
            label: 'Save Practice',
            primary: true,
            onClick: close => {
              close();
              showToast('Practice saved');
            }
          }
        ]
      );
    }));
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', async e => {
      e.preventDefault();

      tabs.forEach(x => x.classList.remove('active'));
      tab.classList.add('active');

      main.innerHTML = i === 0
        ? original
        : i === 1
          ? practice
          : libraryShell;

      refreshIcons();
      wireDynamic();

      if (i === 0) {
        setupInsightsRangeSelector();
        await loadInsights();
      } else if (i === 2) {
        await loadLibrary();
      }
    });
  });

  setupInsightsRangeSelector();
  loadInsights();
}

function setupEarnings() {

  if (!q('.earn-hero')) return;

  qa('.mini-select').forEach(btn => {

    btn.dataset.value = 'This Month';

    btn.addEventListener('click', () => cycleButton(btn, ['This Month', 'This Week', 'This Year']));

  });

}

function setupAccount() {

  if (!q('.profile-card')) return;

  q('.profile-card').style.cursor = 'pointer';

  q('.profile-card').addEventListener('click', () => showProfile());

  qa('.setting-row').forEach(row => {

    const label = q('span', row)?.textContent?.trim();

    if (!label) return;

    if (label === 'Call Recording') {

      row.style.cursor = 'pointer';

      row.addEventListener('click', () => {

        q('.toggle', row).classList.toggle('on');

        showToast(q('.toggle', row).classList.contains('on') ? 'Call recording on' : 'Call recording off');

      });

      return;

    }

    row.addEventListener('click', e => {

      e.preventDefault();

      if (label === 'Profile Settings') return showProfile();

      if (label === 'Log Out') return modal('Log Out', '<p class="modal-help">Are you sure you want to log out?</p>', [

        { label: 'Cancel' }, { label: 'Log Out', danger: true, onClick: async close => { close(); try { const client = window.steadyHandsCRMClient || (window.supabase && window.supabase.createClient(SH_SUPABASE_URL, SH_PUBLISHABLE_KEY)); if (client) await client.auth.signOut(); window.callcenterClearResumeLocation?.(); sessionStorage.removeItem('callcenter-resume-checked'); window.location.replace('login.html'); } catch(error) {console.error('Sign out failed:',error); showToast('Unable to sign out. Try again.');} } }

      ]);

      if (label === 'Phone Settings') return modal('Phone Settings', '<label class="modal-label">Calling number<input class="modal-input" value="(702) 555-0100"></label><label class="modal-label">Caller ID<input class="modal-input" value="Steady Hands"></label>', [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: close => { close(); showToast('Phone settings saved'); } }]);

      if (label === 'Audio Devices') return modal('Audio Devices', '<label class="modal-label">Microphone<select class="modal-input"><option>Default microphone</option></select></label><label class="modal-label">Speaker<select class="modal-input"><option>Default speaker</option></select></label>', [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: close => { close(); showToast('Audio settings saved'); } }]);

      if (label === 'Notifications') return modal('Notifications', '<label class="modal-check"><input type="checkbox" checked> Follow-up reminders</label><label class="modal-check"><input type="checkbox" checked> Earnings updates</label><label class="modal-check"><input type="checkbox"> Team alerts</label>', [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: close => { close(); showToast('Notification settings saved'); } }]);

    });

  });

  function showProfile() {

    modal('Profile Settings', '<label class="modal-label">Name<input class="modal-input" value="Alex Harper"></label><label class="modal-label">Email<input class="modal-input" type="email" value="alex\@company.com"></label>', [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: close => { close(); showToast('Profile saved'); } }]);

  }

}

const SH_SUPABASE_URL = 'https\://glonbvrcudwuzjundrii.supabase.co';

const SH_PUBLISHABLE_KEY = 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr';

function crmText(v) { return String(v ?? ''); }

function crmEscape(v) { return crmText(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function crmUrl(v) {
  try { const u = new URL(crmText(v)); return u.protocol === 'https:' && u.hostname === 'steadyhandsop.com' && /^\/Previews\/[a-z0-9-]+\.html$/i.test(u.pathname) && !!u.searchParams.get('sitekey') ? u.href : ''; }
  catch { return ''; }
}

function crmTags(data) {

  let all = [];

  for (const key of ['tags','sources']) {

    let tags = data[key];

    if (typeof tags === 'string') { try { tags=JSON.parse(tags); } catch { tags=[]; } }

    if (Array.isArray(tags)) all.push(...tags.filter(t => typeof t === 'string'));

  }

  return all.slice(0,5);

}


const CALLCENTER_AREA_CODE_ZONES = {};
function callcenterAddAreaCodes(zone, codes) {
  String(codes).trim().split(/\s+/).filter(Boolean).forEach(code => CALLCENTER_AREA_CODE_ZONES[code] = zone);
}
callcenterAddAreaCodes('America/Los_Angeles', `206 209 213 253 279 310 323 341 360 369 408 415 424 425 442 458 503 509 510 530 541 559 562 619 626 628 650 657 661 669 702 707 714 725 747 760 775 805 818 820 831 840 858 909 916 925 949 951 971 986`);
callcenterAddAreaCodes('America/Phoenix', `480 520 602 623 928`);
callcenterAddAreaCodes('America/Denver', `303 307 385 406 435 505 575 719 720 801 970 983`);
callcenterAddAreaCodes('America/Boise', `208 986`);
callcenterAddAreaCodes('America/Chicago', `205 210 214 217 224 225 228 251 254 262 281 308 309 312 314 316 318 319 320 325 331 334 346 361 409 417 430 432 447 469 479 501 504 507 512 515 534 539 563 573 580 601 605 608 612 615 618 620 630 636 641 651 660 662 682 701 708 712 713 715 726 737 763 769 779 785 806 815 816 817 830 832 847 850 870 872 903 913 918 920 936 940 945 956 972 975 979 985 270 364`);
callcenterAddAreaCodes('America/New_York', `201 202 203 207 212 215 216 220 223 227 229 231 234 239 240 248 252 267 269 272 276 301 302 304 305 313 315 321 330 332 336 339 347 351 352 380 386 401 404 407 410 412 413 419 423 434 440 445 448 470 475 478 484 502 508 513 516 517 518 540 551 561 567 570 571 574 582 585 586 603 606 607 609 610 614 616 617 631 640 646 656 659 667 678 680 681 689 703 704 706 716 717 724 727 732 734 740 743 754 757 762 765 770 772 774 781 786 802 803 804 810 813 814 826 828 835 843 845 848 850 854 856 857 859 860 862 863 864 878 904 908 910 912 914 917 919 929 930 934 937 941 943 947 948 954 959 980 984 989`);
callcenterAddAreaCodes('America/Anchorage', `907`);
callcenterAddAreaCodes('Pacific/Honolulu', `808`);

const CALLCENTER_CALL_WINDOW = {
  start: 9 * 60,
  end: 17 * 60,
  label: 'Monday–Friday · 9:00 AM–5:00 PM local'
};

function callcenterPhoneAreaCode(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  if (digits.length >= 10) return digits.slice(0, 3);
  return '';
}

function callcenterNormalizedZone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('/')) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, '');
  if (/pacific|pst|pdt/.test(key)) return 'America/Los_Angeles';
  if (/mountain|mst|mdt/.test(key)) return 'America/Denver';
  if (/central|cst|cdt/.test(key)) return 'America/Chicago';
  if (/eastern|est|edt/.test(key)) return 'America/New_York';
  if (/arizona/.test(key)) return 'America/Phoenix';
  if (/alaska|akst|akdt/.test(key)) return 'America/Anchorage';
  if (/hawai|hst/.test(key)) return 'Pacific/Honolulu';
  return '';
}

function callcenterLeadZone(phone, storedTimezone) {
  const area = callcenterPhoneAreaCode(phone);

  // An explicit CRM timezone is more accurate than an area-code guess.
  const stored = callcenterNormalizedZone(storedTimezone);
  if (stored) return { zone: stored, area, source: 'crm' };

  const areaZone = CALLCENTER_AREA_CODE_ZONES[area];
  if (areaZone) return { zone: areaZone, area, source: 'area' };

  return { zone: 'America/Los_Angeles', area, source: 'fallback' };
}

function callcenterZoneLabel(zone) {
  return ({
    'America/Los_Angeles': 'Pacific Time',
    'America/Phoenix': 'Arizona Time',
    'America/Denver': 'Mountain Time',
    'America/Boise': 'Mountain Time',
    'America/Chicago': 'Central Time',
    'America/New_York': 'Eastern Time',
    'America/Anchorage': 'Alaska Time',
    'Pacific/Honolulu': 'Hawaii Time'
  })[zone] || String(zone || '').replace(/_/g, ' ');
}

function callcenterClockParts(zone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value || '';
  return { weekday: get('weekday'), hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
}

function callcenterCallStatus(phone, storedTimezone, date = new Date()) {
  const info = callcenterLeadZone(phone, storedTimezone);
  const p = callcenterClockParts(info.zone, date);
  const minutes = p.hour * 60 + p.minute;
  const weekdayIndex = ({ Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 })[p.weekday] ?? 0;
  const weekday = weekdayIndex >= 1 && weekdayIndex <= 5;
  const insideCallWindow =
    weekday &&
    minutes >= CALLCENTER_CALL_WINDOW.start &&
    minutes < CALLCENTER_CALL_WINDOW.end;

  let state = 'late';
  let label = 'Best to call Mon-Fri 9:00 AM-5:00 PM';
  let score = 5000;

  if (insideCallWindow) {
    state = 'good';
    label = 'Good time to call now · Mon-Fri 9:00 AM-5:00 PM';
    score = minutes - CALLCENTER_CALL_WINDOW.start;
  } else if (weekday && minutes < CALLCENTER_CALL_WINDOW.start) {
    state = 'wait';
    score = 1000 + (CALLCENTER_CALL_WINDOW.start - minutes);
  } else {
    const daysUntilWeekday =
      weekdayIndex === 5 ? 3 :
      weekdayIndex === 6 ? 2 :
      weekdayIndex === 0 ? 1 : 1;

    state = 'late';
    score = 2000 + (daysUntilWeekday * 1440);
  }

  return { ...info, ...p, minutes, state, label, score };
}

function callcenterLocalTimeText(phone, storedTimezone, date = new Date()) {
  const info = callcenterLeadZone(phone, storedTimezone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: info.zone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

function callcenterCompactLocalTimeText(phone, storedTimezone, date = new Date()) {
  const info = callcenterLeadZone(phone, storedTimezone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: info.zone,
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

window.callcenterLocalTimeText = callcenterLocalTimeText;
window.callcenterCallStatus = callcenterCallStatus;
window.callcenterLeadZone = callcenterLeadZone;
window.callcenterZoneLabel = callcenterZoneLabel;

function refreshLeadCallTimes(root = document) {
  root.querySelectorAll('[data-live-call-time]').forEach(el => {
    const phone = el.dataset.phone || '';
    const timezone = el.dataset.timezone || '';
    const timing = callcenterCallStatus(phone, timezone);

    if (el.closest('.compact-lead-meta')) {
      const time = callcenterCompactLocalTimeText(phone, timezone);
      el.innerHTML = `<i data-lucide="clock-3"></i> ${crmEscape(time)} · ${crmEscape(callcenterZoneLabel(timing.zone))}`;
    } else if (el.classList.contains('selected-local-time')) {
      const time = callcenterCompactLocalTimeText(phone, timezone);
      el.innerHTML = `<i data-lucide="clock-3"></i> <strong>For them:</strong> ${crmEscape(time)} · ${crmEscape(callcenterZoneLabel(timing.zone))}`;
    } else {
      const time = callcenterLocalTimeText(phone, timezone);
      el.innerHTML = `<i data-lucide="clock-3"></i> <strong>For them:</strong> ${crmEscape(time)} · ${crmEscape(callcenterZoneLabel(timing.zone))}`;
    }
  });

  root.querySelectorAll('[data-live-call-status]').forEach(el => {
    const phone = el.dataset.phone || '';
    const timezone = el.dataset.timezone || '';
    const timing = callcenterCallStatus(phone, timezone);
    el.classList.remove('call-time-good', 'call-time-wait', 'call-time-late');
    el.classList.add(`call-time-${timing.state}`);
    el.innerHTML = `<i data-lucide="phone-call"></i> ${crmEscape(timing.label)}`;
  });

  refreshIcons();
}

function startLeadCallTimeTicker() {
  refreshLeadCallTimes();
  if (window.__steadyHandsCallTimeTicker) return;
  window.__steadyHandsCallTimeTicker = window.setInterval(() => refreshLeadCallTimes(), 30000);
}

// Batch 1: only never-contacted leads belong in fresh Outreach.
// A completed call is still visible in Activity and assigned follow-up workflows.
// Every signed-in user can load the Outreach queue without a territory assignment.
// Authentication and row access are still enforced by Supabase.
async function callcenterLoadTerritory() {
  return true;
}

function callcenterIsFreshLead(lead) {
  if (!lead) return false;
  if (lead.lastcalled) return false;
  const stage = crmText(lead.stage).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['notinterested','callback','followup','retry','sold','client','donotcall','dnc'].includes(stage)) return false;
  const outcome = crmText(lead.outcome).toLowerCase();
  if (/not interested|do not call|call back|callback|follow.?up|sold|no answer|voicemail|busy|wrong number/i.test(outcome)) return false;
  return true;
}

// Batch 2: refresh only lead availability; never reload an ongoing call or the page.
let callcenterAvailabilityTicker = null;
let callcenterAvailabilityBusy = false;
async function callcenterRefreshAvailability() {
  if (callcenterAvailabilityBusy || document.hidden) return;
  const client = window.steadyHandsCRMClient;
  const cards = document.querySelectorAll('#crmLeadCards .lead-card, #selectedLeadTop .lead-card');
  if (!client || !cards.length) return;
  callcenterAvailabilityBusy = true;
  try {
    const { data: ids, error } = await client.rpc('callcenter_unavailable_leads');
    if (error) throw error;
    const blocked = new Set((ids || []).map(String));
    for (const card of cards) {
      if (!blocked.has(String(card.dataset.crmId))) continue;
      if (card.closest('#selectedLeadTop')) {
        card.remove();
      } else {
        card.remove();
      }
    }
  } catch (error) {
    console.warn('Lead availability refresh failed; retrying shortly:', error);
  } finally { callcenterAvailabilityBusy = false; }
}
function callcenterStartAvailabilitySync() {
  if (callcenterAvailabilityTicker) return;
  callcenterRefreshAvailability();
  callcenterAvailabilityTicker = window.setInterval(callcenterRefreshAvailability, 10000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) callcenterRefreshAvailability();
  });
  window.addEventListener('focus', callcenterRefreshAvailability);
  const client = window.steadyHandsCRMClient;
  if (client) {
    client.channel('outreach-crm-dispositions').on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'crm'
    }, payload => {
      const lead = payload.new;
      if (!lead || callcenterIsFreshLead(lead)) return;
      document.querySelectorAll('#crmLeadCards .lead-card, #selectedLeadTop .lead-card').forEach(card => {
        if (String(card.dataset.crmId) === String(lead.id)) card.remove();
      });
    }).subscribe();
  }
}

function makeCRMLinkCard(lead, siteURLs, searchMatch = null) {

  const company = crmEscape(lead.company || lead.name || 'Unnamed business');

  const rawName = crmText(lead.name || '').trim();
  const name = crmEscape(rawName);

  const phone = crmText(lead.phone || '').trim();

  const notes = crmText(lead.notes || '').trim();

  const isFollowup = !!lead.callbackdate || !!lead.callbackat || /follow.?up|callback|call back/i.test([lead.outcome,lead.stage,...crmTags(lead)].join(' '));

  const isNotInterested = lead.stage === 'notinterested' || /not interested/i.test([lead.outcome,...crmTags(lead)].join(' '));

  const tags = crmTags(lead);

  const urls = [...new Set(siteURLs.map(crmUrl).filter(Boolean))];

  const links = urls.map((url,i)=>`<a class="preview-link" target="_blank" rel="noopener noreferrer" href="${crmEscape(url)}"><i data-lucide="external-link"></i> ${urls.length > 1 ? `Preview ${i + 1}` : 'Open Website Preview'}</a>`).join('');

  const card=document.createElement('section');

  card.className='card lead-card';

  card.dataset.crmId=lead.id;

  card.dataset.followup=String(isFollowup);

  card.dataset.notInterested=String(isNotInterested);

  card.dataset.timezone=crmText(lead.timezone||'');
  card.dataset.phone=phone;
  card.dataset.previewUrl=urls[0] || '';

  const callTiming = callcenterCallStatus(phone, lead.timezone);
  const theirLocalTime = callcenterLocalTimeText(phone, lead.timezone);
  const dateText=lead.callbackdate ? `Callback: ${crmEscape(lead.callbackdate)}` : (lead.lastcalled ? 'Previously contacted' : 'Not yet contacted');

  card.innerHTML=`

    <div class="lead-head"><div class="company-icon"><i data-lucide="building-2"></i></div>

      <div class="lead-title"><h2>${company}</h2>${rawName ? `<div class="name">${name}</div>` : ''}</div>

      <button class="star-button" type="button" aria-label="Star company" aria-pressed="false"><i data-lucide="star"></i></button>

    </div>

    <div class="contact-line"><i data-lucide="phone"></i><span>${crmEscape(phone || 'No phone listed')}</span>${phone ? `<button class="copy-btn" type="button" data-copy="${crmEscape(phone)}" aria-label="Copy phone"><i data-lucide="copy"></i></button>` : ''}</div>

    ${searchMatch ? `<div class="search-match-reason"><i data-lucide="search-check"></i><span><strong>“${crmEscape(searchMatch.query)}”</strong> found in ${crmEscape(searchMatch.label)}: <strong>${crmEscape(searchMatch.value)}</strong></span></div>` : ''}

    <div class="compact-lead-meta">
      ${tags.length ? `<div class="tag-row compact-tag-row">${tags.map((t,i)=>`<span class="tag ${crmSourceClass(t)}">${crmEscape(t)}</span>`).join('')}</div>` : ''}
      <div class="compact-call-row">
        <span class="call-time-status call-time-${callTiming.state}" data-live-call-status data-phone="${crmEscape(phone)}" data-timezone="${crmEscape(lead.timezone || '')}"><i data-lucide="phone-call"></i> ${crmEscape(callTiming.label)}</span>
        <span class="compact-local-time" data-live-call-time data-phone="${crmEscape(phone)}" data-timezone="${crmEscape(lead.timezone || '')}"><i data-lucide="clock-3"></i> ${crmEscape(callcenterCompactLocalTimeText(phone, lead.timezone))} · ${crmEscape(callcenterZoneLabel(callTiming.zone))}</span>
      </div>
    </div>

    <div class="lead-details">

      ${tags.length ? `<div class="tag-row">${tags.map((t,i)=>`<span class="tag ${['blue','purple','orange'][i%3]}">${crmEscape(t)}</span>`).join('')}</div>` : ''}

      <div class="call-time-status call-time-${callTiming.state}" data-live-call-status data-phone="${crmEscape(phone)}" data-timezone="${crmEscape(lead.timezone || '')}"><i data-lucide="phone-call"></i> ${crmEscape(callTiming.label)}</div>
      <div class="time-row"><span class="selected-local-time" data-live-call-time data-phone="${crmEscape(phone)}" data-timezone="${crmEscape(lead.timezone || '')}"><i data-lucide="clock-3"></i> <strong>For them:</strong> ${crmEscape(callcenterCompactLocalTimeText(phone, lead.timezone))} · ${crmEscape(callcenterZoneLabel(callTiming.zone))}</span></div>
      <div class="time-row"><span><i data-lucide="calendar"></i> ${dateText}</span></div>

      <div class="preview-links">${links}</div>

      <div class="notes"><div class="notes-title"><i data-lucide="notebook-pen"></i> CRM Notes</div><p>${crmEscape(notes || 'No notes added yet.')}</p></div>

      <button class="call-btn" type="button" data-select-lead ${phone ? '' : 'disabled'}><i data-lucide="check-circle-2"></i> ${phone ? 'Select Lead' : 'No Phone Number'}</button>

      <div class="quick-actions"><button class="quick-btn" type="button"><i data-lucide="shuffle"></i>Next Random Lead</button><button class="quick-btn calendar-btn" type="button"><i data-lucide="calendar-plus"></i>Add to Calendar</button></div>

    </div>`;

  return card;

}


const CRM_SEARCH_TAGS = [
  'Interested','Call Back','Needs More Info','Send Preview','Requested Email',
  'Requested Text','Decision Maker','Hot Lead','Conversion','Sold',
  'Not Interested','No Answer','Left Voicemail','Busy','Wrong Number',
  'Already Has Someone','Bad Timing','Price Concern','Skeptical','Do Not Call',
  'Broken Site','Outdated Site','Site Removed','Already have a website',
  'No Website','Spanish?'
];

const CRM_SEARCH_SOURCES = ['Facebook','Instagram','Nextdoor','Google','Google Maps','Found online','Yelp','LinkedIn','TikTok','Booksy','Other'];
const crmNormalizeSource = v => crmText(v).trim().toLowerCase().replace(/[ _-]+/g,' ');
const crmSourceClass = v => { const x=crmNormalizeSource(v); return x.includes('instagram')?'source-instagram':x.includes('facebook')?'source-facebook':x.includes('nextdoor')?'source-nextdoor':x.includes('google')?'source-google': 'source-other'; };
const crmList = value => { if(Array.isArray(value)) return value; if(typeof value === 'string'){try { const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[value]; }catch {return value?[value]:[]}} return []; };
const crmSearchState = {
  query: '',
  tags: new Set(),
  sources: new Set(),
  combine: 'AND',
  mainFilter: 'All',
  timer: null,
  requestId: 0
};

function crmNormalizeSearch(value) {
  return crmText(value || '').trim();
}

function crmSafeOrTerm(value) {
  return crmNormalizeSearch(value).replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function crmDigits(value) {
  return crmText(value || '').replace(/\D/g, '');
}

function crmIsPhoneSearch(query) {
  const raw = crmNormalizeSearch(query);
  const digits = crmDigits(raw);
  return digits.length >= 1 && !/[a-z]/i.test(raw);
}

function crmFindSearchMatch(lead, query) {
  const raw = crmNormalizeSearch(query);
  if (!raw) return null;

  const queryDigits = crmDigits(raw);

  if (crmIsPhoneSearch(raw)) {
    const phoneFields = [
      ['Phone', lead.phone],
      ['Alternate Phone', lead.altphone]
    ];

    for (const [label, value] of phoneFields) {
      const shown = crmText(value || '').trim();
      if (shown && crmDigits(shown).includes(queryDigits)) {
        return { query: raw, label, value: shown };
      }
    }
    return null;
  }

  const needle = raw.toLowerCase();
  const fields = [
    ['Name', lead.name],
    ['Company', lead.company],
    ['Phone', lead.phone],
    ['Alternate Phone', lead.altphone],
    ['Email', lead.email],
    ['Website', lead.website],
    ['Domain', lead.domain],
    ['Notes', lead.notes],
    ['Issue', lead.issue],
    ['Concerns', lead.concerns],
    ['Origin', lead.origin],
    ['Assigned', lead.assigned]
  ];

  for (const [label, value] of fields) {
    const shown = crmText(value || '').trim();
    if (shown && shown.toLowerCase().includes(needle)) {
      return { query: raw, label, value: shown };
    }
  }

  for (const [label, values] of [['Tag', lead.tags], ['Source', lead.sources]]) {
    let list = values;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { list = [list]; }
    }
    if (!Array.isArray(list)) continue;

    const found = list.find(value => crmText(value).toLowerCase().includes(needle));
    if (found) return { query: raw, label, value: crmText(found) };
  }

  return null;
}

function crmApplyCategoryFilters(db,tags,sources) {
 const clauses=(key,values)=>values.map(value=>key+'.cs.'+JSON.stringify([value]));
 if(tags.length && sources.length && crmSearchState.combine==='OR') return db.or([...clauses('tags',tags),...clauses('sources',sources)].join(','));
 if(tags.length) db=db.or(clauses('tags',tags).join(','));
 if(sources.length) db=db.or(clauses('sources',sources).join(','));
 return db;
}

async function crmFetchAllForPhoneSearch(client, selectedTags = [], selectedSources = []) {
  const rows = [];
  const PAGE_SIZE = 1000;

  for (let from = 0; ; from += PAGE_SIZE) {
    let page = client
      .from('crm')
      .select('id,company,name,phone,altphone,email,website,domain,notes,issue,concerns,origin,assigned,tags,sources,stage,outcome,callbackdate,callbackat,lastcalled,timezone,leadpotential,tier,previewurl,sitekey,has_site_preview,state_code')
      .eq('assigned_user_id', window.steadyHandsOutreachUserId)
      .is('lastcalled', null)
      .neq('stage', 'notinterested')
      .range(from, from + PAGE_SIZE - 1);

    page = crmApplyCategoryFilters(page,selectedTags,selectedSources);

    const { data, error } = await page;
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}


function crmTemplatePreviewUrl(siteKey, templateKey) {
  const key = String(siteKey || '').trim();
  const slug = String(templateKey || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!key || !slug) return '';
  return window.SteadyHandsPreviews?.templateUrl(key,slug) || ''; 
}

async function crmFetchSiteKeyPreviewURLs(client, leads) {
  const result = new Map();
  const keys = [...new Set((leads || []).map(x => String(x.sitekey || '').trim()).filter(Boolean))];
  for (let i=0; i<keys.length; i+=80) {
    const {data,error} = await client.from('site_keys')
      .select('site_key,template_key,active')
      .in('site_key',keys.slice(i,i+80))
      .eq('active',true);
    if (error) { console.warn('Unable to resolve site key previews',error); continue; }
    for (const record of data || []) {
      const url = crmTemplatePreviewUrl(record.site_key,record.template_key);
      if (url) result.set(record.site_key,url);
    }
  }
  return result;
}


function crmKeepSearchControlsAtTop() { /* Search does not scroll the page. */ }

function crmShowLiveSearchLoading(query) {
  const box = q('#crmLeadCards');
  const status = q('#crmStatus');
  if (!box || !status) return;

  status.style.display = '';
  status.textContent = query ? `Searching for “${query}”…` : 'Loading leads...';

  box.innerHTML = Array.from({ length: 4 }, () => `
    <div class="skeleton-lead skeleton-compact search-live-skeleton" aria-hidden="true">
      <div class="sk-row">
        <div class="sk-shape sk-icon"></div>
        <div class="sk-grow">
          <div class="sk-shape sk-title"></div>
          <div class="sk-shape sk-subtitle"></div>
        </div>
        <div class="sk-shape sk-star"></div>
      </div>
      <div class="sk-shape sk-phone"></div>
    </div>
  `).join('');
}

async function crmRunGlobalSearch() {
  const box = q('#crmLeadCards');
  const status = q('#crmStatus');
  const client = window.steadyHandsCRMClient;
  if (!box || !status || !client) return;

  const query = crmNormalizeSearch(q('#crmSearch')?.value);
  crmSearchState.query = query;
  const selectedTags = [...crmSearchState.tags];
  const selectedSources = [...crmSearchState.sources];
  const requestId = ++crmSearchState.requestId;

  crmShowLiveSearchLoading(query);

  try {
    if (!await callcenterLoadTerritory(client)) {
      status.textContent = 'No calling territory assigned. Ask your administrator.';
      box.replaceChildren();
      return;
    }
  } catch (error) {
    status.textContent = error.message;
    box.replaceChildren();
    return;
  }

  if (!query && !selectedTags.length && !selectedSources.length) {
    await loadApprovedPreviewCRM({ preserveSearch: true });
    return;
  }

  let data = [];
  let error = null;

  if (query && crmIsPhoneSearch(query)) {
    try {
      const allRows = await crmFetchAllForPhoneSearch(client, selectedTags, selectedSources);
      const queryDigits = crmDigits(query);

      data = allRows.filter(lead =>
        [lead.phone, lead.altphone]
          .some(value => crmDigits(value).includes(queryDigits))
      );
    } catch (phoneError) {
      error = phoneError;
    }
  } else {
    let db = client
      .from('crm')
      .select('id,company,name,phone,altphone,email,website,domain,notes,issue,concerns,origin,assigned,tags,sources,stage,outcome,callbackdate,callbackat,lastcalled,timezone,leadpotential,tier,previewurl,sitekey,has_site_preview,state_code')
      .eq('assigned_user_id', window.steadyHandsOutreachUserId)
      .is('lastcalled', null)
      .neq('stage', 'notinterested')
      .limit(100);

    if (query) {
      const safe = crmSafeOrTerm(query);
      // Keep the interactive search focused: a full 13-column ILIKE scan
      // against the large CRM was exceeding the database statement timeout.
      const terms = [
        `company.ilike.%${safe}%`,
        `name.ilike.%${safe}%`,
        `phone.ilike.%${safe}%`,
        `altphone.ilike.%${safe}%`,
        `sitekey.ilike.%${safe}%`
      ];
      db = db.or(terms.join(','));
    }

    db = crmApplyCategoryFilters(db,selectedTags,selectedSources);

    const result = await db;
    data = result.data || [];
    error = result.error || null;
  }

  if (requestId !== crmSearchState.requestId) return;

  if (error) {
    console.error('Full CRM search failed:', error);
    status.textContent = 'Search temporarily unavailable. Try a more specific name, phone number, or site key.';
    box.replaceChildren();
    return;
  }

  let leads = (data || []).filter(lead => {
    const values = [lead.stage, lead.outcome, ...crmTags(lead)]
      .map(value => crmText(value).toLowerCase());
    return callcenterIsFreshLead(lead);
  });

  const matches = new Map();
  if (query) {
    leads = leads.filter(lead => {
      const match = crmFindSearchMatch(lead, query);
      if (!match && !String(lead.sitekey || '').toLowerCase().includes(query.toLowerCase())) return false;
      matches.set(String(lead.id), match);
      return true;
    });
  }

    const keySiteMap = await crmFetchSiteKeyPreviewURLs(client, leads);
  if (requestId !== crmSearchState.requestId) return;

  box.replaceChildren(...leads.filter(lead => String(lead.id) !== String(q('#selectedLeadTop .lead-card')?.dataset.crmId || '')).slice(0, 10).map(lead => {
    const urls = [keySiteMap.get(lead.sitekey)].filter(Boolean);
    return makeCRMLinkCard(lead, urls, matches.get(String(lead.id)) || null);
  }));

  status.style.display = leads.length ? 'none' : '';
  status.textContent = leads.length ? '' : 'No matching active leads found.';

  setupCopyButtons();
  setupOutreach();
  callcenterRefreshAvailability();
  refreshIcons();
}

function crmSetupGlobalSearchControls() {
  const input = q('#crmSearch');
  if (input) {
    input.onfocus = () => { /* Keep the current scroll position and selected lead. */ };

    input.oninput = () => {
      // Invalidate any in-flight response immediately, including on backspace.
      ++crmSearchState.requestId;
      clearTimeout(crmSearchState.timer);
      crmSearchState.timer = setTimeout(() => crmRunGlobalSearch(), 260);
    };
  }

  const tagButton = q('#crmTagFilter');
  if(tagButton) tagButton.onclick = () => {
    let tab='tags';
    const stagedTags=new Set(crmSearchState.tags),stagedSources=new Set(crmSearchState.sources);
    let combine=crmSearchState.combine;
    const overlay=modal('Filter tags & sources', '<div class="filter-multisheet"></div>', []);
    const panel=q('.filter-multisheet',overlay);
    const draw=()=>{
      const values=tab==='tags'?CRM_SEARCH_TAGS:CRM_SEARCH_SOURCES;
      const chosen=tab==='tags'?stagedTags:stagedSources;
      panel.innerHTML=`
        <div class="filter-category-tabs" role="tablist" aria-label="Filter categories">
          <button type="button" class="${tab==='tags'?'active':''}" data-tab="tags" role="tab" aria-selected="${tab==='tags'}">Tags <small>${stagedTags.size||''}</small></button>
          <button type="button" class="${tab==='sources'?'active':''}" data-tab="sources" role="tab" aria-selected="${tab==='sources'}">Sources <small>${stagedSources.size||''}</small></button>
        </div>
        <p class="tag-filter-help">${tab==='tags'?'Choose call status and lead tags.':'Choose where leads were found.'} Select multiple options.</p>
        <div class="tag-filter-grid">${values.map(value=>`<button type="button" class="tag-filter-choice ${tab==='sources'?crmSourceClass(value):'tag-neutral'} ${chosen.has(value)?'selected':''}" data-pick="${crmEscape(value)}" aria-pressed="${chosen.has(value)}">${crmEscape(value)}</button>`).join('')}</div>
        <div class="filter-match-controls"><span>Combine Tags + Sources</span>
          <button type="button" class="${combine==='AND'?'active':''}" data-combine="AND">AND</button>
          <button type="button" class="${combine==='OR'?'active':''}" data-combine="OR">OR</button>
        </div>
        <p class="tag-filter-help">Within each category, matching any selected option is enough. AND requires both categories; OR matches either.</p>
        <div class="tag-filter-actions"><button type="button" class="tag-filter-clear">Clear ${tab}</button><button type="button" class="tag-filter-apply">Apply filters</button></div>`;
      qa('[data-tab]',panel).forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;draw()});
      qa('[data-pick]',panel).forEach(btn=>btn.onclick=()=>{const v=btn.dataset.pick;if(chosen.has(v))chosen.delete(v);else chosen.add(v);draw()});
      qa('[data-combine]',panel).forEach(btn=>btn.onclick=()=>{combine=btn.dataset.combine;draw()});
      q('.tag-filter-clear',panel).onclick=()=>{chosen.clear();draw()};
      q('.tag-filter-apply',panel).onclick=()=>{
        crmSearchState.tags=stagedTags;crmSearchState.sources=stagedSources;crmSearchState.combine=combine;
        overlay.remove();
        const count=q('#crmTagFilterCount'),total=stagedTags.size+stagedSources.size;
        if(count){count.hidden=!total;count.textContent=total?String(total):''}
        tagButton.classList.toggle('active',total>0);crmRunGlobalSearch();
      };
    };
    draw();
  };
}

function finishInitialOutreachLoad() {
  q('main.content')?.classList.remove('outreach-loading');
}

async function loadLiveCRMTotals(client) {
  const panel = q('#crmLiveTotals');
  const totalNode = q('#crmTotalLeads');
  if (!panel || !totalNode) return;
  try {
    const { count, error } = await client.from('crm').select('id', { count: 'exact', head: true }).eq('assigned_user_id', window.steadyHandsOutreachUserId);
    if (error) throw error;
    if (count == null) throw new Error('CRM count unavailable.');
    totalNode.textContent = new Intl.NumberFormat('en-US').format(count);
    panel.hidden = false;
  } catch (error) {
    console.warn('CRM total could not be fetched:', error);
    panel.hidden = true;
  }
}

async function loadApprovedPreviewCRM(options = {}) {
  const status = q('#crmStatus');
  const box = q('#crmLeadCards');

  if (!status || !box) return;

  if (!options.preserveSearch || !q('#selectedLeadTop .lead-card')) showSelectedLeadSkeleton();

  q('#crmReload')?.addEventListener('click', () => location.reload());
  crmSetupGlobalSearchControls();

  if (!window.supabase) {
    finishInitialOutreachLoad();
    status.style.display = '';
    status.textContent = 'Unable to connect. Please try again.';
    return;
  }

  const client =
    window.steadyHandsCRMClient ||
    window.supabase.createClient(
      SH_SUPABASE_URL,
      SH_PUBLISHABLE_KEY
    );

  window.steadyHandsCRMClient = client;

  let outreachSession = null;

  try {
    const authResult = await client.auth.getSession();

    if (authResult.error) {
      throw authResult.error;
    }

    outreachSession = authResult.data.session;

    if (!outreachSession) {
      window.location.replace('login.html');
      return;
    }

    window.steadyHandsOutreachUserId = outreachSession.user.id;

    // Check employee access before loading any leads or showing the queue.
    const { data: permission, error: permissionError } = await client
      .from('team_permissions')
      .select('role,active')
      .eq('user_id', outreachSession.user.id)
      .maybeSingle();
    if (permissionError) {
      throw new Error('Unable to verify employee access: ' + permissionError.message);
    }
    const canViewLeads = permission?.active === true &&
      permission.role === 'SALES';
    if (!canViewLeads) {
      status.style.display = '';
      status.textContent = "You currently don't have access to view the leads. Please contact your administrator.";
      box.replaceChildren();
      q('#selectedLeadTop')?.replaceChildren();
      q('#crmSearch')?.setAttribute('disabled', 'disabled');
      q('#crmReload')?.removeAttribute('disabled');
      finishInitialOutreachLoad();
      return;
    }

    // Count all CRM records after confirming employee access, without blocking lead loading.
    void loadLiveCRMTotals(client);

    const { data: callRows = [], error: callRowsError } = await client
      .from('callcenter_call_activity')
      .select('crm_id')
      .eq('user_id', outreachSession.user.id)
      .not('crm_id', 'is', null)
      .limit(5000);

    if (callRowsError) {
      console.warn('Unable to load personal call history:', callRowsError);
      window.steadyHandsCalledCRMIds = new Set();
    } else {
      window.steadyHandsCalledCRMIds = new Set(
        callRows.map(row => String(row.crm_id)).filter(Boolean)
      );
    }
  } catch (error) {
    console.error('Authentication check failed:', error);
    finishInitialOutreachLoad();
    status.style.display = '';
    status.textContent = 'Unable to connect. Please try again.';
    return;
  }

  try {
    if (!await callcenterLoadTerritory(client)) {
      status.textContent = 'No calling territory assigned. Ask your administrator.';
      box.replaceChildren();
      finishInitialOutreachLoad();
      return;
    }
  } catch (error) {
    status.textContent = error.message;
    box.replaceChildren();
    finishInitialOutreachLoad();
    return;
  }

  status.textContent = 'Loading leads...';

  box.innerHTML = Array.from({ length: 6 }, () => `
    <div class="skeleton-lead skeleton-compact" aria-hidden="true">
      <div class="sk-row">
        <div class="sk-shape sk-icon"></div>
        <div class="sk-grow">
          <div class="sk-shape sk-title"></div>
          <div class="sk-shape sk-subtitle"></div>
        </div>
        <div class="sk-shape sk-star"></div>
      </div>
      <div class="sk-shape sk-phone"></div>
    </div>
  `).join('');

  try {
    // SECURITY: select by authenticated salesperson assignment at query time.
    // Do not enumerate global preview_inventory or unrestricted CRM rows.
    const userId = outreachSession.user.id;
    const { data: assigned, error: assignedError } = await client
      .from('crm')
      .select('id,company,name,phone,notes,tags,sources,stage,outcome,callbackdate,callbackat,lastcalled,timezone,leadpotential,tier,state_code,sitekey,previewurl,assigned_user_id')
      .eq('assigned_user_id', userId)
      .eq('admin_archived', false)
      .order('created', { ascending: false })
      .limit(1000);
    if (assignedError) throw assignedError;
    const leads = (assigned || []).filter(callcenterIsFreshLead);
    const selectedId = new URLSearchParams(location.search).get('crm_id') ||
      (() => { try { return sessionStorage.getItem('steadyhands-selected-outreach-crm-id') || ''; } catch { return ''; } })();
    const selectedLead = leads.find(lead => lead.id === selectedId);
    const ordered = callcenterShuffle(leads);
    if (selectedLead) {
      const index = ordered.findIndex(lead => lead.id === selectedLead.id);
      if (index >= 0) ordered.splice(index, 1);
      ordered.unshift(selectedLead);
      window.steadyHandsForcedCRMId = selectedLead.id;
    }
    const keys = await crmFetchSiteKeyPreviewURLs(client, ordered);
    box.replaceChildren(...ordered.map(lead => makeCRMLinkCard(
      lead, [keys.get(lead.sitekey)].filter(Boolean)
    )));
    status.style.display = ordered.length ? 'none' : '';
    status.textContent = ordered.length ? '' : 'No assigned leads available. Ask your administrator to assign leads.';

    // User-specific Outreach stats are loaded from callcenter_call_activity in user-data.js.\n\n    setupCopyButtons();
    setupOutreach();
    callcenterStartAvailabilitySync();
    startLeadCallTimeTicker();
    refreshIcons();
    finishInitialOutreachLoad();
  } catch (error) {
    finishInitialOutreachLoad();
    status.style.display = '';
    const detail = String(error?.message || 'Unknown error');
    status.textContent = 'Unable to load leads: ' + detail;

    box.replaceChildren();

    console.error(error);
  }
}



function setupDesktopOutreachPaneScrolling() {
  if (!document.body.classList.contains('page-outreach')) return;

  const content = document.querySelector('.page-outreach .content');
  const leftPane = document.querySelector('#crmLeadCards');
  const rightPane = document.querySelector('#selectedLeadTop');

  if (!content || !leftPane || !rightPane) return;

  const onWheel = (event) => {
    if (!window.matchMedia('(min-width: 900px)').matches) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const contentRect = content.getBoundingClientRect();
    if (
      event.clientX < contentRect.left ||
      event.clientX > contentRect.right ||
      event.clientY < contentRect.top ||
      event.clientY > contentRect.bottom
    ) return;

    const rightRect = rightPane.getBoundingClientRect();
    const pane = event.clientX < rightRect.left ? leftPane : rightPane;
    const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);

    if (maxScroll <= 0) return;

    const next = Math.max(0, Math.min(maxScroll, pane.scrollTop + event.deltaY));
    if (next === pane.scrollTop) return;

    event.preventDefault();
    pane.scrollTop = next;
  };

  document.addEventListener('wheel', onWheel, { passive: false });
}

document.addEventListener('DOMContentLoaded', () => {

  refreshIcons();
  setupDesktopOutreachPaneScrolling();

  setupCopyButtons();

  loadApprovedPreviewCRM();

  setupSkills();

  setupEarnings();

  setupAccount();

});