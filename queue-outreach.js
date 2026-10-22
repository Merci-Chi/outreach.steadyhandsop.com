/* Shared active-queue selection for both calling pages. */
(() => {
'use strict';
const client=()=>window.steadyHandsCRMClient;
let active=null,items=[];
async function sync(){
 const c=client();if(!c)throw Error('CRM is unavailable.');
 const auth=await c.auth.getUser();if(auth.error||!auth.data?.user)throw Error('Please sign in again.');
 const userId=auth.data.user.id;
 const res=await c.from('outreach_queues').select('id,name,filters,sort_mode').eq('owner_id',userId).eq('is_active',true).maybeSingle();
 if(res.error)throw res.error;
 const next=res.data||null;
 let rows=[];
 if(next){const result=await c.from('outreach_queue_items').select('id,crm_id,status,position').eq('queue_id',next.id).order('position',{ascending:true}).limit(1000);if(result.error)throw result.error;rows=result.data||[];}
 active=next;items=rows;
 const progress=document.getElementById('shQueueProgress');
 if(progress)progress.textContent=active?`${active.name} · Active · ${items.length} leads`:'No active queue · assigned uncalled leads';
 return {c,userId};
}
async function next(){
 const {c,userId}=await sync();
 if(!active)return false;
 const usable=items.filter(x=>x.status!=='skipped');
 if(!usable.length)throw Error(`Active queue "${active.name}" is empty. Add leads or set it Inactive to use assigned leads.`);
 const ids=usable.map(x=>x.crm_id);
 const result=await c.from('crm').select('id,company,name,phone,timezone,created,lastcalled,do_not_call,admin_archived,stage,outcome,tags,call_status').eq('assigned_user_id',userId).in('id',ids);
 if(result.error)throw result.error;
 const disposition=window.SteadyHandsLeadDisposition;
 if(!disposition)throw Error('Calling eligibility is unavailable. Please refresh.');
 let called=new Set();
 if(active.filters?.exclude_called){
  const history=await c.from('callcenter_call_activity').select('crm_id,outcome').eq('user_id',userId).in('crm_id',ids).limit(5000);
  if(history.error)throw history.error;
  called=new Set((history.data||[]).filter(x=>!['didnotcall','didntcall'].includes(String(x.outcome||'').toLowerCase().replace(/[^a-z]/g,''))).map(x=>String(x.crm_id)));
 }
 const byId=new Map((result.data||[]).filter(x=>x.phone&&!disposition.callBlocked(x)&&!['complete','completed','sold','archived'].includes(String(x.stage||'').toLowerCase().replace(/[^a-z]/g,''))&&(!active.filters?.exclude_called||(disposition.callStatus(x)!=='Called'&&!called.has(String(x.id))))).map(x=>[String(x.id),x]));
 let ordered=usable.map(i=>byId.get(String(i.crm_id))).filter(Boolean);
 const mode=active.sort_mode;
 if(mode==='az'||mode==='za')ordered.sort((a,b)=>(mode==='az'?1:-1)*String(a.company||a.name||'').localeCompare(String(b.company||b.name||'')));
 if(mode==='newest'||mode==='oldest')ordered.sort((a,b)=>(mode==='newest'?-1:1)*(String(a.created||'').localeCompare(String(b.created||''))||String(a.id).localeCompare(String(b.id))));
 if(!ordered.length)throw Error(`No eligible ${active.filters?.exclude_called?'uncalled ':''}leads in active queue "${active.name}". Update its filters or set it Inactive.`);
 const current=String(window.steadyHandsCallLead?.id||document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId||new URLSearchParams(location.search).get('crm_id')||'');
 const ix=ordered.findIndex(x=>String(x.id)===current);
 const row=ordered[ix>=0?(ix+1)%ordered.length:0];
 if(String(row.id)===current)throw Error('Only the current eligible lead remains in this queue.');
 if(window.SteadyHandsLeadNavigation?.isBusy())throw Error('Finish the current call before switching prospects.');
 window.SteadyHandsLeadNavigation.open(row,disposition.callStatus(row)==='Called');
 return true;
}
window.SteadyHandsQueue={next,sync};
function mount(){
 const toolbar=document.querySelector('.sh-reference-toolbar')||document.querySelector('.workspace-intro');
 if(toolbar&&!document.getElementById('shQueueProgress')){const progress=document.createElement('span');progress.id='shQueueProgress';progress.className='sh-queue-control';progress.setAttribute('aria-live','polite');toolbar.appendChild(progress);}
 sync().catch(e=>{const progress=document.getElementById('shQueueProgress');if(progress)progress.textContent='Queue unavailable: '+e.message;});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.addEventListener('pageshow',()=>sync().catch(()=>{}));
})();
