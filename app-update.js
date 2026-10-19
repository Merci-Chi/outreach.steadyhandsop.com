/* Check deployed page headers periodically; apply updates only when idle. */
(() => {
  const CHECK_EVERY_MS = 60000;
  const loadedAt = Date.now();
  const documentModified = Date.parse(document.lastModified || '');
  const dirty = new Set();
  let fingerprint = null, pending = null, checking = false, reloading = false;
  let quietUntil = loadedAt + 15000, applyTimer = null;
  let hadController = Boolean(navigator.serviceWorker?.controller);

  function editable(target) {
    return target?.matches?.('textarea:not([readonly]),input:not([readonly]):not([type=search]):not([type=checkbox]):not([type=radio]):not([type=range]),[contenteditable=true]');
  }
  function busy() {
    for (const element of dirty) if (!element.isConnected) dirty.delete(element);
    return document.hidden || Date.now() < quietUntil || dirty.size > 0 ||
      editable(document.activeElement) ||
      window.SteadyHandsTwilioVoice?.isActive?.() ||
      window.SteadyHandsInboundVoice?.isBusyForUpdate?.() ||
      window.SteadyHandsInboundVoice?.isActive?.() ||
      document.querySelector('#refRegularCallTracker:not([hidden]),#shFeedbackOverlay');
  }
  function applyWhenIdle() {
    if (!pending || reloading) return;
    clearTimeout(applyTimer);
    if (busy()) { applyTimer = setTimeout(applyWhenIdle, 1000); return; }
    try {
      const key = 'steadyhands-auto-update:' + location.pathname;
      if (sessionStorage.getItem(key) === pending) { pending = null; return; }
      sessionStorage.setItem(key, pending);
    } catch {}
    reloading = true;
    location.reload();
  }
  function markUpdate(version) { pending = version; applyWhenIdle(); }
  async function check() {
    if (checking || reloading || !navigator.onLine) return;
    checking = true;
    try {
      // GitHub Pages supplies ETag/Last-Modified on each published page.
      // Last-Modified also catches deployments where script URLs stay the same.
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set('app_check', String(Date.now()));
      const result = await fetch(url, {method:'HEAD',cache:'no-store'});
      if (result.ok) {
        const modified = result.headers.get('last-modified') || '';
        const etag = result.headers.get('etag') || '';
        const next = modified + '|' + etag;
        if (modified || etag) {
          if (fingerprint && next !== fingerprint) markUpdate(next);
          else if (!fingerprint && Number.isFinite(documentModified) && Date.parse(modified) > documentModified + 1000) markUpdate(next);
          fingerprint = next;
        }
      }
      const registrations = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(registrations.map(registration => registration.update().catch(() => {})));
    } catch (error) {
      console.warn('Automatic update check unavailable:', error);
    } finally { checking = false; }
  }
  document.addEventListener('input', event => {
    if (editable(event.target)) dirty.add(event.target);
    quietUntil = Date.now() + 15000;
  });
  const saved = event => {
    const form = event.detail?.form || event.target;
    for (const element of dirty) if (element.form === form || element === form) dirty.delete(element);
    applyWhenIdle();
  };
  document.addEventListener('submit', () => { quietUntil = Date.now() + 15000; });
  document.addEventListener('reset', saved);
  window.addEventListener('steadyhands:changes-saved', saved);
  window.addEventListener('steadyhands:voice-state', event => {
    if (event.detail?.state === 'ended') quietUntil = Date.now() + 35000;
    applyWhenIdle();
  });
  window.addEventListener('steadyhands:inbound-transcript', event => {
    if (event.detail?.ended) quietUntil = Date.now() + 35000;
    applyWhenIdle();
  });
  window.addEventListener('online', check);
  window.addEventListener('focus', () => { quietUntil = Math.max(quietUntil,Date.now()+15000); void check(); });
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { quietUntil=Math.max(quietUntil,Date.now()+15000);void check();applyWhenIdle(); } });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      markUpdate(fingerprint || 'worker:' + Date.now());
    });
  }
  async function init() {
    try {
      await navigator.serviceWorker?.register('sw.js', {scope:'./',updateViaCache:'none'});
    } catch (error) { console.warn('App update service unavailable:', error); }
    await check();
    setInterval(check, CHECK_EVERY_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else void init();
})();
