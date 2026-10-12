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
   const current=selectedId();const index=usable.findIndex(x=>String(x.crm_id)===String(current));
   const next=usable[index>=0? (index+1)%usable.length:0];
   if(usable.length===1&&String(next.crm_id)===String(current)){alert('Only this pending lead remains in your queue.');return;}
   // Do not claim a call occurred by merely advancing the queue.
   const permission=await c.from('crm').select('id').eq('id',next.crm_id).eq('assigned_user_id',(await c.auth.getUser()).data.user.id).maybeSingle();
   if(permission.error||!permission.data){alert('This prospect is no longer assigned to you. Please refresh the queue.');return;}
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
