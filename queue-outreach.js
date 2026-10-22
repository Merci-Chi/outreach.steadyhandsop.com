(() => {
'use strict';
if(!document.body.classList.contains('page-outreach'))return;
const client=()=>window.steadyHandsCRMClient;
const selectedId=()=>document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId||'';
const key='steadyhands-selected-outreach-crm-id';
const openLead=id=>{sessionStorage.setItem(key,String(id));window.location.assign('index.html?crm_id='+encodeURIComponent(id));};
let active=null,items=[],busy=false;
const eligible=()=>new Set([...document.querySelectorAll('#crmLeadCards .lead-card[data-crm-id]')].map(el=>String(el.dataset.crmId)));

async function sync(){
 const c=client();if(!c)return;
 const auth=await c.auth.getUser();if(!auth.data?.user)return;
 const res=await c.from('outreach_queues').select('id,name').eq('owner_id',auth.data.user.id).eq('is_active',true).maybeSingle();
 if(res.error){console.warn('Active queue unavailable',res.error);return;}
 active=res.data||null;
 if(active){const rows=await c.from('outreach_queue_items').select('id,crm_id,status,position').eq('queue_id',active.id).order('position',{ascending:true}).limit(1000);if(rows.error){console.warn('Queue items unavailable',rows.error);return;}items=(rows.data||[]);}
 else items=[];
 update();
}
function update(){
 const b=document.getElementById('shQueueNext');if(!b)return;
 b.textContent='Next in Queue';
 const progress=document.getElementById('shQueueProgress');
 if(progress)progress.textContent=active?`${active.name} · ${items.filter(x=>x.status==='completed').length}/${items.length} completed`:'No active queue · add leads on the Queue page';
}
async function advance(){
 if(busy)return;busy=true;
 const button=document.getElementById('shQueueNext');if(button)button.disabled=true;
 try{
  await sync();
  const c=client();if(!c){alert('CRM is unavailable.');return;}
  if(active){
   const usable=items.filter(x=>x.status==='pending');
   if(!usable.length){alert('Queue complete. Activate another queue or add leads.');return;}
   const auth=await c.auth.getUser();
   if(auth.error||!auth.data?.user?.id)throw Error('Please sign in.');
   const ids=usable.map(x=>x.crm_id);
   const [crm,history]=await Promise.all([
     c.from('crm').select('id,lastcalled,do_not_call,stage,outcome,phone').eq('assigned_user_id',auth.data.user.id).in('id',ids),
     c.from('callcenter_call_activity').select('crm_id,outcome').eq('user_id',auth.data.user.id).in('crm_id',ids).limit(5000)
   ]);
   if(crm.error||history.error)throw Error('Unable to verify call eligibility.');
   const called=new Set((history.data||[]).filter(x=>String(x.outcome||'').toLowerCase().replace(/[^a-z]/g,'')!=='didnotcall').map(x=>String(x.crm_id)));
   const available=new Set((crm.data||[]).filter(x=>x.phone&&!x.lastcalled&&!x.do_not_call&&!called.has(String(x.id))&&!['notinterested','donotcall','complete','sold'].includes(String(x.stage||'').toLowerCase().replace(/[^a-z]/g,''))).map(x=>String(x.id)));
   const fresh=usable.filter(x=>available.has(String(x.crm_id)));
   if(!fresh.length){alert('No uncalled leads remain in this queue.');return;}
   const current=selectedId(),ix=fresh.findIndex(x=>String(x.crm_id)===String(current));
   const next=fresh[ix>=0?(ix+1)%fresh.length:0];
   if(fresh.length===1&&String(next.crm_id)===String(current)){alert('Only this uncalled lead remains in the queue.');return;}
   openLead(next.crm_id);return;
  }
  alert('Your queue is empty. Add leads from the Leads page or enable Auto Add in Queue Settings.');

 }catch(e){console.error(e);alert('Unable to select the next lead.');}
 finally{busy=false;if(button)button.disabled=false;}
}
function mount(){
 const toolbar=document.querySelector('.sh-reference-toolbar')||document.querySelector('.workspace-intro');if(!toolbar)return;
 if(!document.getElementById('shQueueNext')){
  const wrap=document.createElement('div');wrap.className='sh-queue-control';
  wrap.innerHTML='<span id="shQueueProgress" aria-live="polite">Checking queue…</span><button id="shQueueNext" type="button">Next in Queue</button>';
  toolbar.appendChild(wrap);
  document.getElementById('shQueueNext').addEventListener('click',advance);
 }
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.addEventListener('pageshow',()=>sync());
})();
