/* Steady Hands Call Center service worker
   Freshness-first: same-origin app files always come from the network when available. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    ])
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if (event.data?.type === 'SHOW_SCHEDULED_NOTIFICATION') {
    const data = event.data || {};
    event.waitUntil(
      self.registration.showNotification(
        data.title || 'Scheduled call',
        {
          body: data.body || '',
          icon: 'images/icon-192.png',
          badge: 'images/icon-192.png',
          tag: data.tag || 'scheduled-call',
          renotify: true,
          data: { url: data.url || 'index.html' }
        }
      )
    );
  }
});



self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data?.text?.() || '' };
    } catch {}
  }

  if(data.kind==='incoming-call'&&Date.parse(data.expires_at||'')<=Date.now())return;
  const title = data.title || 'Scheduled call';
  const options = {
    body: data.body || '',
    icon: 'images/icon-192.png',
    badge: 'images/icon-192.png',
    tag: data.tag || 'scheduled-call',
    renotify: true,
    data: {
      kind: data.kind || null,
      callSid: data.call_sid || null,
      url: data.url || 'index.html',
      crm_id: data.crm_id || null,
      reminder_minutes: data.reminder_minutes ?? null
    }
  };

  event.waitUntil((async()=>{
    await self.registration.showNotification(title, options);
    if(data.kind==='incoming-call'){
      const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      list.forEach(client=>client.postMessage({type:'steadyhands:incoming-wake',callSid:data.call_sid}));
    }
  })());
});

self.addEventListener('message', event => {
 if(event.data?.type==='steadyhands:incoming-alert'&&event.source?.id){
  event.waitUntil(self.registration.showNotification(event.data.title,{...event.data.options,data:{kind:'incoming-call',clientId:event.source.id}}));
 }
 if(event.data?.type==='steadyhands:close-incoming-alert'){
  event.waitUntil(self.registration.getNotifications({tag:'steadyhands-incoming-call'}).then(items=>items.filter(item=>item.data?.clientId===event.source?.id).forEach(item=>item.close())));
 }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if(event.notification?.data?.kind==='incoming-call'){
    event.waitUntil((async()=>{
      const data=event.notification.data;
      let client=data.clientId?await self.clients.get(data.clientId):null;
      if(!client){
       const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});
       client=list.find(item=>{try{return new URL(item.url).origin===self.location.origin}catch{return false}});
      }
      if(client){client.postMessage({type:'steadyhands:open-incoming',callSid:data.callSid});return client.focus();}
      const sid=/^CA[0-9a-fA-F]{32}$/.test(data.callSid||'')?data.callSid:'';
      return self.clients.openWindow(sid?'/index.html?incoming='+encodeURIComponent(sid):'/index.html');
    })());return;
  }
  const target = event.notification?.data?.url || 'index.html';

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clientsList) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.navigate(target);
          return client.focus();
        }
      } catch {}
    }

    return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() => fetch(request))
  );
});
