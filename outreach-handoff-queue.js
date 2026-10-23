/* Recipient handoff inbox. Never open an unassigned CRM prospect directly. */
(()=>{'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
async function init(){
 const client=window.steadyHandsCRMClient;if(!client)return;
 const auth=await client.auth.getUser();const user=auth.data?.user;if(!user)return;
 let rows=[];
 const host=document.createElement('section');host.id='shHandoffQueue';host.style.padding='12px';
 const panel=document.getElementById('shToolsPanel'),body=document.getElementById('shToolsBody');
 if(!panel||!body)return;
 async function openDetail(handoffId){
  if(!uuid.test(handoffId||''))return;
  const {data,error}=await client.rpc('outreach_handoff_detail',{p_handoff_id:handoffId});
  if(error||!data)return;
  let view=document.getElementById('shHandoffDetail');
  if(!view){view=document.createElement('section');view.id='shHandoffDetail';view.className='card';view.style.padding='18px';document.querySelector('main.content')?.prepend(view);}
  view.innerHTML='<h2>Shared lead · '+esc(data.kind==='spanish'?'Spanish-speaking sales':'Development')+'</h2>'+
  '<p><strong>'+esc(data.company||data.contact||'Prospect')+'</strong></p>'+
  '<p>Contact: '+esc(data.contact||'Not provided')+' · '+esc(data.phone||'No phone')+'</p>'+
  '<p>Email: '+esc(data.email||'Not provided')+'</p>'+
  '<p>Handoff notes: '+esc(data.handoff_notes||'None')+'</p>'+
  '<p>CRM notes: '+esc(data.notes||'None')+'</p>'+
  (data.kind==='spanish'&&data.status==='accepted'?'<a href="index.html?crm_id='+encodeURIComponent(data.lead_id)+'">Open assigned prospect in Outreach</a>':'');
  window.scrollTo?.({top:0,behavior:'smooth'});
 }
 async function refresh(){
  const {data,error}=await client.from('outreach_lead_handoffs').select('id,crm_id,kind,notes,status,created_at').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(100);
  if(error)return;rows=data||[];
  host.innerHTML='<h3>Shared leads queue</h3>'+rows.filter(r=>r.status==='pending').map(r=>
   '<article class="sh-tools-item"><div><strong>'+esc(r.kind==='spanish'?'Spanish-speaking sales transfer':'Development request')+'</strong><p>'+esc(r.notes||'A lead has been shared with you')+'</p><button type="button" data-accept-handoff="'+esc(r.id)+'">'+(r.kind==='spanish'?'Accept and open':'Acknowledge and open')+'</button></div></article>'
  ).join('')+(rows.some(r=>r.status==='pending')?'':'<p>No pending shared leads.</p>');
  if(body.parentNode!==null)body.parentNode.insertBefore(host,body);
 }
 panel.addEventListener('click',async e=>{
  const accept=e.target.closest('[data-accept-handoff]');if(!accept)return;
  const item=rows.find(x=>x.id===accept.dataset.acceptHandoff);if(!item)return;
  accept.disabled=true;
  const {data,error}=await client.rpc('outreach_accept_lead_handoff',{p_handoff_id:item.id});
  if(error){accept.disabled=false;accept.insertAdjacentText('afterend',' '+error.message);return;}
  if(item.kind==='spanish')location.assign('index.html?crm_id='+encodeURIComponent(data));
  else location.assign('index.html?handoff_id='+encodeURIComponent(item.id));
 });
 // Notification View lead link targets an unassigned CRM row before acceptance.
 // Redirect it to the correct protected handoff instead of an inaccessible prospect.
 document.addEventListener('click',e=>{
  const lead=e.target.closest?.('[data-task-lead]');if(!lead)return;
  const item=rows.find(r=>String(r.crm_id)===lead.dataset.taskLead);
  if(!item)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(item.kind==='spanish'&&item.status==='accepted')location.assign('index.html?crm_id='+encodeURIComponent(item.crm_id));
  else if(item.status==='accepted')location.assign('index.html?handoff_id='+encodeURIComponent(item.id));
  else {document.getElementById('shNoticesOpen')?.click();host.querySelector('[data-accept-handoff="'+item.id+'"]')?.focus();}
 },true);
 document.getElementById('shNoticesOpen')?.addEventListener('click',refresh);
 await refresh();
 const handoffId=new URLSearchParams(location.search).get('handoff_id');
 if(handoffId)await openDetail(handoffId);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
