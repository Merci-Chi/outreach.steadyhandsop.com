/* Batch 7 — read-only links between existing Earnings/Activity pages and assigned CRM sales.
   Never infer a commission from a sale status; payouts continue to use existing logic. */
(() => {
  'use strict';
  const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=v=>v==='confirmed'?'confirmed':v==='cancelled'?'cancelled':'pending';
  let active=false;
  let previouslySignedIn=null;
  const notice=(slot,title,details)=>{slot.innerHTML=`<div class="sh-linked-state" role="status"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(details)}</p><button type="button" class="sh-linked-retry">Retry</button></div>`;slot.querySelector('button')?.addEventListener('click',refresh);};
  async function refresh(){
    if(active)return;
    const slot=document.getElementById(document.body.classList.contains('page-earnings')?'linkedSales_earnings':'linkedSales_activity');
    if(!slot)return;
    active=true;
    try{
      const client=window.steadyHandsCRMClient;
      if(!client){notice(slot,'Sign in required','Sign in to view your assigned sales.');return;}
      const {data:auth,error:authError}=await client.auth.getUser();
      const user=auth?.user;
      if(authError||!user){previouslySignedIn=null;notice(slot,'Sign in required','Sign in to view your assigned sales.');return;}
      if(previouslySignedIn!==user.id){previouslySignedIn=user.id;slot.textContent='Loading assigned sales…';}
      const {data,error}=await client.from('outreach_sales')
        .select('id,company_name,status,registered_at,agreement_at,payment_at,hosting_at,launch_at')
        .eq('salesperson_user_id',user.id).order('updated_at',{ascending:false}).limit(5);
      if(error){
        const permission=['42501','PGRST301'].includes(String(error.code||''));
        notice(slot,permission?'Access restricted':'Sales unavailable',permission?'You do not have permission to see these sales. Contact your administrator.':'Sales tracking could not load. Your earnings and activity are unaffected.');
        return;
      }
      if(!data?.length){notice(slot,'No linked sales','Sales attributed to your account will appear here.');return;}
      slot.innerHTML=data.map(r=>{
        const progress=['registered_at','agreement_at','payment_at','hosting_at','launch_at'].filter(k=>r[k]).length;
        const label=status(r.status);
        const url='sales.html?'+new URLSearchParams({sale:String(r.id)}).toString();
        return `<a class="sh-linked-row" href="${escapeHTML(url)}"><span><strong>${escapeHTML(r.company_name||'Business')}</strong><small>${progress}/5 milestones complete · View sale progress</small></span><span class="sh-linked-status ${label}">${label[0].toUpperCase()+label.slice(1)}</span></a>`;
      }).join('');
      window.lucide?.createIcons?.();
    }catch(error){notice(slot,'Connection issue','Unable to load linked sales right now.');console.warn('Linked sales:',error);}
    finally{active=false;}
  }
  function init(){
    refresh();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
    const c=window.steadyHandsCRMClient;
    c?.auth?.onAuthStateChange?.((event)=>{
      if(event==='SIGNED_OUT'){
        previouslySignedIn=null;
        const slot=document.getElementById(document.body.classList.contains('page-earnings')?'linkedSales_earnings':'linkedSales_activity');
        if(slot)notice(slot,'Sign in required','Sign in to view your assigned sales.');
      }else if(event==='SIGNED_IN')queueMicrotask(refresh);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
