(() => {
  const CACHE_KEY = 'steadyhands-theme';
  const valid = value => value === 'dark' || value === 'light';

  function applyTheme(theme, persist = true) {
    const next = valid(theme) ? theme : 'light';
    document.documentElement.dataset.theme = next;
    document.body?.setAttribute('data-theme', next);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#071421' : '#102945');

    if (persist) {
      try { localStorage.setItem(CACHE_KEY, next); } catch {}
    }

    window.dispatchEvent(new CustomEvent('steadyhands:theme-changed', {
      detail: { theme: next }
    }));

    return next;
  }

  function cachedTheme() {
    try {
      const saved = localStorage.getItem(CACHE_KEY);
      return valid(saved) ? saved : 'light';
    } catch {
      return 'light';
    }
  }

  // Apply cached appearance immediately to minimize light/dark flashing.
  applyTheme(cachedTheme(), false);

  async function syncAccountTheme() {
    const client = window.steadyHandsCRMClient;
    if (!client) return;

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;

      const userId = sessionData?.session?.user?.id;
      if (!userId) return;

      const { data, error } = await client
        .from('callcenter_profiles')
        .select('theme_preference')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        if (error.code !== '42703') console.warn('Unable to load account theme:', error);
        return;
      }

      if (valid(data?.theme_preference)) applyTheme(data.theme_preference);
    } catch (error) {
      console.warn('Unable to sync account theme:', error);
    }
  }

  window.SteadyHandsTheme = {
    apply: applyTheme,
    current: () => document.documentElement.dataset.theme || cachedTheme(),
    sync: syncAccountTheme
  };

  // Install after page CSS so late-loaded modal/card styles cannot force white.
  const addDarkSurfaces=()=>{
    if(document.getElementById('shUnifiedDarkSurfaces'))return;
    const link=document.createElement('link');
    link.id='shUnifiedDarkSurfaces';
    link.rel='stylesheet';
    link.href='unified-dark-surfaces.css?v=20261020-unified-v1';
    document.head.appendChild(link);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addDarkSurfaces);
  else addDarkSurfaces();

  document.addEventListener('DOMContentLoaded', () => {
    document.body?.setAttribute('data-theme', document.documentElement.dataset.theme || cachedTheme());

    // Supabase/auth scripts may initialize just after DOMContentLoaded.
    let attempts = 0;
    const trySync = () => {
      attempts += 1;
      if (window.steadyHandsCRMClient) {
        syncAccountTheme();
        return;
      }
      if (attempts < 20) setTimeout(trySync, 150);
    };
    trySync();
  });
})();
