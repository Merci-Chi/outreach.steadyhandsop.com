/* Recipient handoff queue: accept Spanish ownership before navigating. */
(()=>{'use strict';
async function init(){
 const panel=document.getElementById('shToolsPanel');
 if(!panel)return;
 const client=window.steadyHandsCRMClient;
 const {data:auth}=await client?.auth?.getUser?.()||{};
 if(!auth?.user)return;
 let rows=[];
 async function refresh(){
  const {data,error}=await client.from('outreach_lead_handoffs').select('id,crm_id,kind,notes,status,created_at').eq('recipient_id',auth.user.id).eq('status','pending').order('created_at',{ascending:false}).limit(50);
  if(error)return;
  rows=data||[];
  const host=document.getElementById('shHandoffQueue')||document.createElement('section');
  host.id='shHandoffQueue';
  host.innerHTML='<h3>Shared leads</h3>'+rows.map(r=>'<div class="sh-tools-item"><div><strong>'+(r.kind==='spanish'?'Spanish-speaking sales transfer':'Development request')+'</strong><p>'+escapeText(r.notes||'A lead has been shared with you.')+'</p><button type="button" data-accept-handoff="'+r.id+'">'+(r.kind==='spanish'?'Accept and open lead':'Acknowledge request')+'</button></div></div>').join('');
  const body=document.getElementById('shToolsBody');if(body&&body.parentNode)body.parentNode.insertBefore(host,body);
 }
 function escapeText(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 panel.addEventListener('click',async e=>{
  const b=e.target.closest('[data-accept-handoff]');if(!b)return;
  b.disabled=true;
  const item=rows.find(r=>r.id===b.dataset.acceptHandoff);if(!item)return;
  const {data,error}=await client.rpc('outreach_accept_lead_handoff',{p_handoff_id:item.id});
  if(error){b.disabled=false;b.textContent='Unable to accept: '+error.message;return;}
  if(item.kind==='spanish'){location.assign('index.html?crm_id='+encodeURIComponent(data));return;}
  await refresh();
 });
 document.getElementById('shNoticesOpen')?.addEventListener('click',refresh);
 window.addEventListener('steadyhands:handoff-created',refresh);
 await refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
