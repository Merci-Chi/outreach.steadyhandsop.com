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
 if(active){const rows=await c.from('outreach_queue_items').select('id,crm_id,status,position').eq('queue_id',active.id).order('position',{ascending:true}).limit(1000);if(rows.error){console.warn('Queue items unavailable',rows.error);return;}const authorized=eligible();items=(rows.data||[]).filter(x=>authorized.has(String(x.crm_id)));}
 else items=[];
 update();
}
function update(){
 const b=document.getElementById('shQueueNext');if(!b)return;
 b.textContent=active?'Next in Queue':'Random Lead';
 const progress=document.getElementById('shQueueProgress');
 if(progress)progress.textContent=active?`${active.name} · ${items.filter(x=>x.status==='completed').length}/${items.length} completed`:'No active queue · random selection';
}
async function advance(){
 if(busy)return;busy=true;
 const button=document.getElementById('shQueueNext');if(button)button.disabled=true;
 try{
  await sync();
  if(active){
   const usable=items.filter(x=>x.status==='pending'&&eligible().has(String(x.crm_id)));
   if(!usable.length){alert('Queue complete. Activate another queue or add leads.');return;}
   const current=selectedId();const index=usable.findIndex(x=>String(x.crm_id)===String(current));
   const next=usable[index>=0? (index+1)%usable.length:0];
   if(usable.length===1&&String(next.crm_id)===String(current)){alert('Only this pending lead remains in your queue.');return;}
   // Do not claim a call occurred by merely advancing the queue.
   openLead(next.crm_id);return;
  }
  // Use the existing live CRM-based random button, if available.
  const random=[...document.querySelectorAll('#selectedLeadTop .quick-btn')].find(b=>/random/i.test(b.textContent)&&b!==button);
  if(random){random.click();return;}
  const candidates=[...eligible()].filter(id=>id!==selectedId());
  if(!candidates.length){alert('No other assigned leads are available.');return;}
  openLead(candidates[Math.floor(Math.random()*candidates.length)]);

 }catch(e){console.error(e);alert('Unable to select the next lead.');}
 finally{busy=false;if(button)button.disabled=false;}
}
function mount(){
 const toolbar=document.querySelector('.sh-reference-toolbar')||document.querySelector('.workspace-intro');if(!toolbar)return;
 if(!document.getElementById('shQueueNext')){
  const wrap=document.createElement('div');wrap.className='sh-queue-control';
  wrap.innerHTML='<span id="shQueueProgress" aria-live="polite">Checking queue…</span><button id="shQueueNext" type="button">Random Lead</button>';
  toolbar.appendChild(wrap);
  document.getElementById('shQueueNext').addEventListener('click',advance);
 }
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.addEventListener('pageshow',()=>sync());
})();
