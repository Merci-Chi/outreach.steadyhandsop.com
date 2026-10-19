(() => {
  'use strict';
  const client = window.steadyHandsCRMClient || window.supabase?.createClient(
    'https://glonbvrcudwuzjundrii.supabase.co', 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',
    {auth:{persistSession:true,autoRefreshToken:true}});
  const message = document.getElementById('pause-message');
  const button = document.getElementById('refresh');
  let checking = false;
  async function check() {
    if (checking) return;
    checking = true; button.disabled = true;
    message.textContent = 'Checking account status…';
    try {
      if (!client) throw Error('Connection unavailable. Reload to retry.');
      const {data:auth,error:authError} = await client.auth.getSession();
      if (authError || !auth?.session) {location.replace('login.html');return;}
      const {data,error} = await client.rpc('outreach_access_status');
      if (error || typeof data?.is_paused !== 'boolean') throw Error('Could not verify your status. Please recheck.');
      if (!data.is_paused) {location.replace('index.html');return;}
      if (data.action_required) {location.replace('action-needed.html?open=1');return;}
      message.textContent = 'Pause — an agreement or account action is still required. Complete it in your team onboarding portal, then recheck here. Access resumes automatically once the requirement clears.';
    } catch (error) {message.textContent = error.message;}
    finally {checking = false;button.disabled = false;}
  }
  button.onclick = check;
  document.getElementById('logout').onclick = async () => {await client?.auth.signOut();location.replace('login.html');};
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  window.addEventListener('storage', event => {if(event.key==='outreach-access-changed')check();});
  document.addEventListener('visibilitychange', () => {if(document.visibilityState==='visible')check();});
  window.setInterval(check, 5000);
  check();
})();
