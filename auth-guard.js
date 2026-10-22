// Checks the authenticated session on every non-login screen and restores the last app location.
(() => {
  if (location.pathname.endsWith('/login.html')) return;

  const RESUME_KEY = 'callcenter-last-location';
  const RESUME_CHECKED_KEY = 'callcenter-resume-checked';
  const MAX_RESUME_AGE = 1000 * 60 * 60 * 24 * 30;
  const HANDOFF_KEY = 'outreach-onboarding-return';
  const OUTREACH_ORIGIN = 'https://outreach.steadyhandsop.com';
  const PORTAL_ORIGIN = 'https://onboard.steadyhandsop.com';
  const workspacePages = new Set(['index.html','call.html','leads.html','queue.html','activity.html','sales.html','earnings.html','account.html','skills.html','admin.html']);
  function safeWorkspace(value) {
    try {
      const url = new URL(value, OUTREACH_ORIGIN);
      if (url.origin !== OUTREACH_ORIGIN || !workspacePages.has(url.pathname.slice(1))) return null;
      return url.pathname.slice(1) + url.search + url.hash;
    } catch { return null; }
  }
  function returnLocation(userId) {
    try {
      const saved=JSON.parse(sessionStorage.getItem(HANDOFF_KEY)||'null');
      if(saved?.userId===userId && Date.now()-saved.savedAt<86400000)return safeWorkspace(saved.href);
    } catch {}
    return null;
  }
  function portalURL(userId) {
    const current=safeWorkspace(location.pathname + (location.search||'') + (location.hash||''));
    const resume=current||returnLocation(userId)||'index.html';
    try {sessionStorage.setItem(HANDOFF_KEY,JSON.stringify({userId,href:resume,savedAt:Date.now()}));sessionStorage.setItem(RESUME_CHECKED_KEY,'1');}catch{}
    // Send only the page and selected record ID; keep business/contact details local.
    const destination=new URL(resume,OUTREACH_ORIGIN);
    const record=destination.searchParams.get('crm_id');destination.search='';destination.hash='';
    if(record)destination.searchParams.set('crm_id',record);
    const portal=new URL('/',PORTAL_ORIGIN);
    portal.searchParams.set('from','outreach');portal.searchParams.set('return_to',destination.href);
    return portal.href;
  }


  const accessStyle = document.createElement('style');
  accessStyle.textContent = '.auth-checking body{visibility:hidden;pointer-events:none}';
  document.head.appendChild(accessStyle);
  document.documentElement.classList.add('auth-checking');

  function currentPageName() {
    const name = location.pathname.split('/').pop();
    return name || 'index.html';
  }

  function safeResumeValue(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!parsed || !parsed.href || !parsed.savedAt) return null;
      if (Date.now() - Number(parsed.savedAt) > MAX_RESUME_AGE) return null;

      const url = new URL(parsed.href, location.href);
      if (url.origin !== location.origin) return null;
      if (url.pathname.endsWith('/login.html') || url.pathname.endsWith('/pause.html')) return null;

      return {
        href: url.pathname.split('/').pop() + url.search + url.hash,
        label: parsed.label || 'where you left off',
        savedAt: Number(parsed.savedAt)
      };
    } catch {
      return null;
    }
  }

  function saveResumeLocation(href, label = '') {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.pathname.endsWith('/login.html') || url.pathname.endsWith('/pause.html')) return;
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        href: url.pathname.split('/').pop() + url.search + url.hash,
        label,
        savedAt: Date.now()
      }));
    } catch {}
  }

  function clearResumeLocation() {
    localStorage.removeItem(RESUME_KEY);
  }

  window.callcenterSetResumeLocation = saveResumeLocation;
  window.callcenterClearResumeLocation = clearResumeLocation;

  function saveCurrentPage() {
    const page = currentPageName();

    // A plain Outreach/index page is the normal starting screen.
    // app.js stores a specific index.html?crm_id=... value when a lead is intentionally selected.
    if (page === 'index.html' && !new URLSearchParams(location.search).get('crm_id')) return;

    let label = document.title || page;
    if (page === 'call.html') {
      const params = new URLSearchParams(location.search);
      label = params.get('company') || params.get('contact') || 'selected lead';
    }

    saveResumeLocation(location.href, label);
  }

  function showResumePrompt(resume) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'resume-overlay';
      overlay.innerHTML = `
        <div class="resume-dialog" role="dialog" aria-modal="true" aria-labelledby="resumeTitle">
          <div class="resume-icon"><i data-lucide="history"></i></div>
          <h2 id="resumeTitle">Continue where you left off?</h2>
          <p>${resume.label && resume.label !== 'where you left off'
            ? 'You were last viewing <strong>' + escapeHtml(resume.label) + '</strong>.'
            : 'You have a previous place in the app you can return to.'}</p>
          <div class="resume-actions">
            <button type="button" class="resume-start-fresh">Start fresh</button>
            <button type="button" class="resume-continue">Continue</button>
          </div>
        </div>`;

      const style = document.createElement('style');
      style.textContent = `
        .resume-overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:22px;background:rgba(7,18,31,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
        .resume-dialog{width:min(430px,100%);background:#fff;color:#10243d;border-radius:24px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.28);text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .resume-icon{width:58px;height:58px;margin:0 auto 16px;border-radius:18px;display:grid;place-items:center;background:#eef4fb;color:#153a64}
        .resume-icon svg{width:28px;height:28px}
        .resume-dialog h2{margin:0 0 9px;font-size:24px;line-height:1.15;color:#10243d}
        .resume-dialog p{margin:0;color:#617084;font-size:15px;line-height:1.55}
        .resume-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:24px}
        .resume-actions button{border:0;border-radius:14px;padding:13px 14px;font-size:15px;font-weight:800;cursor:pointer}
        .resume-start-fresh{background:#edf1f5;color:#24374d}
        .resume-continue{background:#102945;color:#fff}
        html[data-theme="dark"] .resume-dialog{background:#101f2f;color:#eef6ff}
        html[data-theme="dark"] .resume-icon{background:#16314b;color:#65b7ff}
        html[data-theme="dark"] .resume-dialog h2{color:#eef6ff}
        html[data-theme="dark"] .resume-dialog p{color:#97aabd}
        html[data-theme="dark"] .resume-start-fresh{background:#172a3c;color:#d8e6f3}
        html[data-theme="dark"] .resume-continue{background:#1677e8;color:#fff}
      `;

      document.head.appendChild(style);
      document.body.appendChild(overlay);
      window.lucide?.createIcons();

      overlay.querySelector('.resume-continue').addEventListener('click', () => {
        overlay.remove();
        style.remove();
        resolve('continue');
      });

      overlay.querySelector('.resume-start-fresh').addEventListener('click', () => {
        overlay.remove();
        style.remove();
        resolve('fresh');
      });
    });
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (!window.supabase) throw new Error('Sign-in library unavailable');

      const client = window.steadyHandsCRMClient || window.supabase.createClient(
        'https://glonbvrcudwuzjundrii.supabase.co',
        'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      window.steadyHandsCRMClient = client;

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      if (!data.session) {
        location.replace('login.html');
        return;
      }

      // Action pages remain available so a paused associate can resolve requirements.
      const actionPages = ['action-needed.html','alreadyoncommission.html','currentlyonhourlywage.html'];
      const actionPage = actionPages.includes(currentPageName());
      const userId=data.session.user.id;
      let accessNavigating=false;
      const handoff=()=>{accessNavigating=true;document.documentElement.classList.add('auth-checking');location.replace(portalURL(userId));};
      if(actionPage){handoff();return;}
      let accessErrorDialog = null;
      function showAccessError() {
        // A failed request is not evidence of a pause or unfinished onboarding.
        // Keep the workspace blocked and offer recovery on this page.
        if (!accessErrorDialog) {
          accessErrorDialog = document.createElement('dialog');
          accessErrorDialog.setAttribute('aria-labelledby','outreachAccessErrorTitle');
          accessErrorDialog.setAttribute('aria-describedby','outreachAccessErrorMessage');
          accessErrorDialog.style.cssText = 'max-width:440px;width:calc(100% - 36px);box-sizing:border-box;border:1px solid #d6e0ee;border-radius:18px;padding:26px;color:#10284a;background:#fff;box-shadow:0 20px 80px #10284a55;font-family:system-ui,sans-serif';
          accessErrorDialog.innerHTML = '<h2 id="outreachAccessErrorTitle">Unable to check account access</h2><p id="outreachAccessErrorMessage">The connection to Outreach could not be verified. Try again in a moment. Your current page has been kept.</p><button type="button" style="padding:12px 20px;border:0;border-radius:10px;background:#087cff;color:#fff;font:inherit;font-weight:700">Try again</button>';
          accessErrorDialog.addEventListener('cancel', event => event.preventDefault());
          accessErrorDialog.querySelector('button').addEventListener('click', () => location.reload());
          document.body.appendChild(accessErrorDialog);
          accessErrorDialog.showModal();
        }
        document.documentElement.classList.remove('auth-checking');
      }
      function clearAccessError() {
        if (accessErrorDialog) { accessErrorDialog.close(); accessErrorDialog.remove(); accessErrorDialog = null; }
      }
      let callingBlocked = false;
      function showCallingBlock() {
        callingBlocked = true;
        document.documentElement.classList.add('calling-blocked');
        if (!document.getElementById('callingBlockedNotice')) {
          const style = document.createElement('style');
          style.textContent = '.calling-blocked body > :not(#callingBlockedNotice){display:none!important}.calling-blocked #callingBlockedNotice{display:block!important;max-width:440px;margin:15vh auto;padding:28px;border-radius:18px;background:#fff;color:#10284a;font:16px system-ui;box-shadow:0 12px 60px #10284a33}';
          document.head.appendChild(style);
          const notice = document.createElement('main');
          notice.id = 'callingBlockedNotice';
          notice.innerHTML = '<h1>Outreach access paused</h1><p>Your calling and lead access are temporarily paused. Please contact your team administrator for help with next steps.</p><button type="button">Sign out</button>';
          notice.querySelector('button').onclick = async () => { await client.auth.signOut(); location.replace('login.html'); };
          document.body.appendChild(notice);
          window.dispatchEvent(new CustomEvent('outreach:calling-blocked'));
        }
        document.documentElement.classList.remove('auth-checking');
      }
      let inFlight = null;
      async function checkAccess() {
        if (inFlight) return inFlight;
        inFlight = (async () => {
          const {data:status,error} = await client.rpc('outreach_access_status');
          if (error || typeof status?.is_paused !== 'boolean') throw new Error('Could not verify account access.');
          window.outreachAccessStatus = status;
          clearAccessError();
          if (status.calling_blocked === true) {
            showCallingBlock();
            return status;
          }
          if (callingBlocked) { location.reload(); return status; }
          if (status.is_paused) {
            handoff();
          } else {
            const resume=returnLocation(userId);
            if(resume){
              try{sessionStorage.removeItem(HANDOFF_KEY);}catch{}
              const current=currentPageName()+(location.search||'')+(location.hash||'');
              if(resume!==current){accessNavigating=true;location.replace(resume);return status;}
            }
            if(currentPageName()==='pause.html'||actionPage)handoff();
          }
          return status;
        })();
        try { return await inFlight; } finally { inFlight = null; }
      }
      async function refreshAccess() {
        // A submission must read after any pre-submission check has finished.
        if (inFlight) {try {await inFlight;} catch {}}
        return checkAccess();
      }
      window.outreachRecheckAccess = refreshAccess;
      let initialStatus;
      try { initialStatus = await checkAccess(); }
      catch {
        showAccessError();return;
      }
      if(accessNavigating)return;
      const recheck = () => refreshAccess().catch(() => {
        // Failed verification blocks the workspace without claiming onboarding is required.
        showAccessError();
      });
      window.addEventListener('focus', recheck);
      window.addEventListener('pageshow', recheck);
      window.addEventListener('online', recheck);
      window.addEventListener('outreach:actions-completed', recheck);
      window.addEventListener('storage', event => { if (event.key === 'outreach-access-changed') recheck(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); });
      // Realtime triggers an immediate fresh read; polling covers missed events.
      client.channel?.('outreach-access-' + data.session.user.id)
        .on('broadcast', {event:'access-changed'}, recheck)
        .subscribe();
      window.setInterval(recheck, 5000);
      if (actionPage || currentPageName() === 'pause.html') {
        document.documentElement.classList.remove('auth-checking');
        return;
      }
      if (initialStatus.is_paused) return;

      // A persistent, account-level first-login check. Existing employees aren't forced
      // through a new password setup after this feature is deployed.
      const isOnboardingPage = currentPageName() === 'onboarding.html';
      const joinedAt = Date.parse(data.session.user?.created_at || '') || 0;
      const rollout = Date.parse('2026-10-11T00:00:00Z');
      const requiresSetup = joinedAt >= rollout && data.session.user?.user_metadata?.steadyhands_onboarding_complete !== true;
      if (requiresSetup && !isOnboardingPage) {
        location.replace('onboarding.html');
        return;
      }
      if (!requiresSetup && isOnboardingPage) {
        location.replace('index.html');
        return;
      }

      document.documentElement.classList.remove('auth-checking');

      const alreadyChecked = sessionStorage.getItem(RESUME_CHECKED_KEY) === '1';
      sessionStorage.setItem(RESUME_CHECKED_KEY, '1');

      if (!alreadyChecked) {
        const resume = safeResumeValue(localStorage.getItem(RESUME_KEY));

        if (resume) {
          const choice = await showResumePrompt(resume);

          if (choice === 'continue') {
            const current = currentPageName() + location.search + location.hash;
            if (current !== resume.href) {
              location.href = resume.href;
              return;
            }
          } else {
            clearResumeLocation();
            const current = currentPageName() + location.search + location.hash;
            if (current !== 'index.html') {
              location.href = 'index.html';
              return;
            }
          }
        }
      }

      window.addEventListener('pagehide', saveCurrentPage);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveCurrentPage();
      });
    } catch (e) {
      console.error('Login check failed:', e);
      location.replace('login.html');
    }
  });
})();

