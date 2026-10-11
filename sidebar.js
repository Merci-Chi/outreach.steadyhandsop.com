/* Shared production sidebar — Outreach then Leads; Batch 9. */
(() => {
 const items=[['Outreach','index.html','phone-call'],['Leads','leads.html','users'],['Queue','queue.html','list-ordered'],['Sales Pipeline','sales.html','workflow'],['Earnings','earnings.html','wallet'],['Performance','activity.html','chart-no-axes-combined'],['Training','skills.html','graduation-cap'],['Settings','account.html','settings']];
 const current=location.pathname.split('/').pop()||'index.html';
 const isSettings=current==='admin.html'||current==='account.html';
 const active=isSettings?'account.html':current==='call.html'?'index.html':current;
 const mobile=()=>matchMedia('(max-width: 899px)').matches;
 function init(){
  const app=document.querySelector('.app');if(!app||document.querySelector('#shSidebar'))return;
  const drawer=document.createElement('aside');drawer.id='shSidebar';drawer.className='sh-sidebar';drawer.setAttribute('aria-label','Main navigation');
  drawer.innerHTML=`<div class="sh-sidebar-brand"><img src="images/icon-192.png" alt=""/><span>Steady Hands</span><button type="button" class="sh-sidebar-collapse" aria-label="Collapse sidebar" title="Collapse sidebar"><i data-lucide="panel-left-close"></i></button></div><nav class="sh-sidebar-links" aria-label="App pages">${items.map(([label,url,icon])=>`<a href="${url}" class="sh-sidebar-link${url===active?' active':''}" ${url===active?'aria-current="page"':''} title="${label}"><i data-lucide="${icon}"></i><span>${label}</span></a>`).join('')}</nav><div class="sh-sidebar-foot"><i data-lucide="circle-user-round"></i><span>My Account</span></div>`;
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='sh-sidebar-backdrop';backdrop.setAttribute('aria-label','Close menu');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='sh-sidebar-toggle';toggle.setAttribute('aria-label','Open navigation menu');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','shSidebar');toggle.innerHTML='<i data-lucide="menu"></i>';
  document.body.prepend(backdrop,drawer);
  const header=app.querySelector('.topbar-row,.call-topbar');
  if(header){header.insertBefore(toggle,header.firstChild)}else app.insertBefore(toggle,app.firstChild);
  const close=()=>{document.body.classList.remove('sh-menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation menu')};
  const open=()=>{document.body.classList.add('sh-menu-open');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Close navigation menu')};
  toggle.addEventListener('click',()=>{if(!mobile()){drawer.querySelector('.sh-sidebar-collapse').click();return;}document.body.classList.contains('sh-menu-open')?close():open();});
  backdrop.addEventListener('click',close);
  drawer.querySelector('.sh-sidebar-collapse').addEventListener('click',()=>{
    if(mobile()){close();return}
    document.body.classList.toggle('sh-sidebar-collapsed');
    try{localStorage.setItem('sh-sidebar-collapsed',document.body.classList.contains('sh-sidebar-collapsed')?'1':'0')}catch{}
    drawer.querySelector('.sh-sidebar-collapse').innerHTML=document.body.classList.contains('sh-sidebar-collapsed')?'<i data-lucide="panel-left-open"></i>':'<i data-lucide="panel-left-close"></i>';
    window.lucide?.createIcons?.();
  });
  try{if(localStorage.getItem('sh-sidebar-collapsed')==='1')document.body.classList.add('sh-sidebar-collapsed')}catch{}
  drawer.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  let touchStart=null;
  drawer.addEventListener('touchstart',e=>{touchStart=e.touches[0]?.clientX??null},{passive:true});
  drawer.addEventListener('touchend',e=>{if(touchStart!==null&&touchStart-(e.changedTouches[0]?.clientX??touchStart)>65)close();touchStart=null},{passive:true});
  const desktopQuery=matchMedia('(min-width: 900px)');
  desktopQuery.addEventListener?.('change',close);
  toggle.addEventListener('click',()=>{
    if(mobile()&&document.body.classList.contains('sh-menu-open'))
      drawer.querySelector('.sh-sidebar-link')?.focus({preventScroll:true});
  });
  backdrop.addEventListener('click',()=>toggle.focus({preventScroll:true}));
  document.addEventListener('keydown',e=>{
    if(!mobile()||!document.body.classList.contains('sh-menu-open')||e.key!=='Tab')return;
    const focusable=[...drawer.querySelectorAll('a[href],button:not([disabled])')];
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  document.documentElement.classList.add('sh-sidebar-ready');
  window.lucide?.createIcons?.();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
