/* Steady Hands Outreach Tasks & Notifications. Database is source of truth. */
// Self-contained fallback if a cached page fails to load recent-called-leads.js.
window.steadyHandsLoadRecentCalls ||= async function(client,userId,limit=50){
 const {data:calls,error}=await client.from('callcenter_call_activity')
  .select('crm_id,created_at').eq('user_id',userId).not('crm_id','is',null)
  .order('created_at',{ascending:false}).limit(1000);
 if(error)throw error;
 const ids=new Map();
 for(const call of calls||[]){const id=String(call.crm_id||'');if(id&&!ids.has(id))ids.set(id,call.created_at);if(ids.size>=limit)break;}
 if(!ids.size)return [];
 const {data:leads,error:lookupError}=await client.from('crm').select('id,company,name,phone').eq('assigned_user_id',userId).in('id',[...ids.keys()]);
 if(lookupError)throw lookupError;
 const byId=new Map((leads||[]).map(row=>[String(row.id),row]));
 return [...ids].filter(([id])=>byId.has(id)).map(([id,time])=>({...byId.get(id),lastcalled:time}));
};

(()=>{'use strict';
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client,userId,tasks=[],notices=[],callbacks=[],panel='',filter='today',timer;
const due=t=>t?.due_at?new Date(t.due_at):null;
const now=()=>new Date();
const dateLabel=d=>d?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d)):'No due date';
const today=t=>{const d=due(t);return d&&d.toDateString()===now().toDateString();};
const overdue=t=>{const d=due(t);return d&&d<now()&&t.status!=='done';};
function iconRefresh(){try{window.lucide?.createIcons?.()}catch{}}
function banner(msg){return `<p class="sh-tools-error" role="alert">${safe(msg)}</p>`;}
function progress(){const open=tasks.filter(t=>t.status!=='done');const count=open.filter(t=>today(t)||overdue(t)).length;const cb=callbacks.filter(c=>c.callbackat||c.callbackdate).length;const unread=notices.filter(n=>!n.read_at).length;
$('shTaskToday').textContent=`Tasks today: ${count}`;$('shTaskCallbacks').textContent=`Follow-ups: ${cb}`;$('shTaskUnread').textContent=`Unread: ${unread}`;
for(const [id,value] of [['shTasksBadge',count],['shNoticesBadge',unread]]){const el=$(id);el.hidden=!value;el.textContent=value>99?'99+':value;}}
function open(mode){panel=mode;$('shToolsPanel').hidden=false;$('shToolsBackdrop').hidden=false;document.body.style.setProperty('--sh-panel-open','1');render();$('shToolsPanel').focus();}
function close(){panel='';$('shToolsPanel').hidden=true;$('shToolsBackdrop').hidden=true;}
async function fetchData(){if(!client||!userId)return;const [tr,nr,cr]=await Promise.all([
client.from('outreach_tasks').select('*').eq('assigned_to',userId).order('due_at',{ascending:true,nullsFirst:false}).limit(250),
client.from('outreach_notifications').select('*').eq('recipient_id',userId).order('created_at',{ascending:false}).limit(100),
client.from('crm').select('id,company,callbackdate,callbackat,callback_owner_id').eq('callback_owner_id',userId).eq('stage','callback').limit(100)
]);
if(tr.error||nr.error){const m=(tr.error||nr.error).message; if(panel)$('shToolsBody').innerHTML=banner('Tasks and notifications are not ready. Run the separate Supabase SQL migration. '+m);return;}
tasks=tr.data||[];notices=nr.data||[];callbacks=cr.error?[]:cr.data||[];progress();if(panel)render();
notifyBrowser();}
function notifyBrowser(){if(!('Notification'in window)||Notification.permission!=='granted')return; const seenKey='sh-task-alerted-'+userId;let seen={};try{seen=JSON.parse(localStorage.getItem(seenKey)||'{}')}catch{};
let touched=false;for(const t of tasks){if(t.status==='done'||!t.due_at)continue;const diff=(new Date(t.due_at)-now())/60000;const milestones=[60,30,10,5,0];const reached=milestones.find(v=>diff<=v&&diff>v-2);if(reached===undefined)continue;const k=t.id+':'+t.due_at+':'+reached;if(seen[k])continue;seen[k]=true;touched=true;try{new Notification('Steady Hands task reminder',{body:t.title+(reached===0?' is due now':` is due in ${reached} minutes`),tag:'sh-task-'+t.id})}catch{}}
if(touched)localStorage.setItem(seenKey,JSON.stringify(seen));}
function taskHTML(t){const isDone=t.status==='done';return `<article class="sh-tools-item ${overdue(t)?'is-overdue':''}"><input type="checkbox" data-task-toggle="${safe(t.id)}" ${isDone?'checked':''} aria-label="Complete ${safe(t.title)}" style="margin-top:4px"><div><strong>${safe(t.title)}</strong><p>${safe(dateLabel(t.due_at))} · ${safe(t.priority||'normal')} priority${t.notes?' · '+safe(t.notes):''}</p><div class="sh-tools-actions">${t.lead_id?`<button type="button" data-task-lead="${safe(t.lead_id)}">Open lead</button>`:''}<button type="button" data-task-delete="${safe(t.id)}">Delete</button></div></div></article>`;}
function callbackHTML(c){return `<article class="sh-tools-item"><div><strong>Callback: ${safe(c.company||'Customer')}</strong><p>${safe(c.callbackat||c.callbackdate||'Scheduled callback')} · From CRM</p><div class="sh-tools-actions"><button type="button" data-task-lead="${safe(c.id)}">Open lead</button></div></div></article>`;}
function taskList(){const items=tasks.filter(t=>filter==='completed'?t.status==='done':filter==='upcoming'?t.status!=='done'&&!today(t)&&!overdue(t):t.status!=='done'&&(today(t)||overdue(t)));const addCallbacks=filter==='today'?callbacks:[];return `<div class="sh-list-top"><div><span class="sh-section-kicker">YOUR WORKSPACE</span><p class="sh-list-subtitle">Keep your day organized and stay on top of every follow-up.</p></div><button class="sh-add-task" id="shCreateTask" type="button" aria-label="Add task" title="Add task"><i data-lucide="plus"></i></button></div><div class="sh-tools-filters">${['today','upcoming','completed'].map(k=>`<button type="button" data-task-filter="${k}" aria-pressed="${k===filter}">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div>${items.map(taskHTML).join('')}${addCallbacks.map(callbackHTML).join('')||'<div class="sh-tools-empty"><div class="sh-empty-icon"><i data-lucide="check-check"></i></div><strong>All caught up</strong><p>Nothing to show here right now. Tap + to add a task.</p></div>'}<p class="sh-tools-muted">Scheduled callbacks sync from your CRM. Record the call outcome to complete a follow-up.</p>`;}
function formHTML(){return `<form id="shTaskForm" class="sh-tools-form"><label>Task name <span class="sh-required">*</span><input name="title" maxlength="160" required autofocus placeholder="e.g. Send website preview"></label><div class="sh-form-grid"><label>Due date & time<input name="due" type="datetime-local"></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div><label>Link a lead <span class="sh-optional">Optional</span><input type="search" id="shLeadLookup" autocomplete="off" placeholder="Search business name or phone number"><select name="lead" id="shRecentCalledLead"><option value="">Loading recently called leads…</option></select></label><p id="shRecentCalledLeadStatus" class="sh-tools-muted" role="status">Choose a business you recently called. No CRM ID needed.</p><label>Notes <span class="sh-optional">Optional</span><textarea name="notes" maxlength="1500" rows="3" placeholder="Add any details or instructions..."></textarea></label><div class="sh-task-modal-actions"><button type="button" class="sh-task-cancel" id="shCancelTask">Cancel</button><button class="sh-tools-primary sh-task-save" type="submit"><i data-lucide="check"></i> Create task</button></div><p class="sh-tools-muted">This task is saved to your account. Admin-assigned tasks appear here too.</p></form>`;}
function notificationHTML(){const unread=notices.filter(n=>!n.read_at).length;return `<div class="sh-notice-intro"><div><span class="sh-section-kicker">UPDATES & REMINDERS</span><p>${unread?`${unread} unread ${unread===1?'notification':'notifications'}`:'You’re all caught up'}</p></div>${unread?'<button class="sh-read-all" type="button" id="shReadAll"><i data-lucide="check-check"></i> Mark all read</button>':''}</div>${notices.map(n=>`<article class="sh-notice-card ${n.read_at?'':'is-unread'}"><span class="sh-notice-icon"><i data-lucide="${n.read_at?'bell':'bell-ring'}"></i></span><div class="sh-notice-content"><div class="sh-notice-title-row"><strong>${safe(n.title||'Notification')}</strong>${!n.read_at?'<span class="sh-unread-dot" aria-label="Unread"></span>':''}</div><p>${safe(n.body||'')}</p><small>${safe(dateLabel(n.created_at))}</small><div class="sh-tools-actions">${n.kind==='lead_handoff'?`<button type="button" data-handoff-notice="${safe(n.id)}" ${n.handoff_id?'data-handoff-id="'+safe(n.handoff_id)+'"':''}>View handoff</button>`:n.lead_id?`<button type="button" data-task-lead="${safe(n.lead_id)}">View lead</button>`:''}${!n.read_at?`<button type="button" data-notice-read="${safe(n.id)}">Mark read</button>`:''}</div></div></article>`).join('')||'<div class="sh-tools-empty"><div class="sh-empty-icon"><i data-lucide="bell-off"></i></div><strong>No notifications yet</strong><p>New reminders and updates will appear here.</p></div>'}`;}
let modalLastFocus=null;
function showTaskModal(){if($('shTaskModal'))return;modalLastFocus=document.activeElement;const wrapper=document.createElement('div');wrapper.id='shTaskModal';wrapper.className='sh-task-modal-shell';wrapper.innerHTML=`<div class="sh-task-modal-backdrop" data-task-modal-close></div><section class="sh-task-modal" role="dialog" aria-modal="true" aria-labelledby="shTaskModalTitle" tabindex="-1"><div class="sh-task-modal-head"><div class="sh-task-modal-badge"><i data-lucide="list-plus"></i></div><div><span class="sh-section-kicker">NEW TASK</span><h2 id="shTaskModalTitle">Create a task</h2><p>Plan your next action in seconds.</p></div><button class="sh-task-modal-x" type="button" data-task-modal-close aria-label="Close task form">&times;</button></div><div class="sh-task-modal-content">${formHTML()}</div></section>`;document.body.appendChild(wrapper);iconRefresh();wrapper.querySelector('input[name="title"]').focus();void populateRecentCalledLeads();}
async function populateRecentCalledLeads(){
 const select=$('shRecentCalledLead'),status=$('shRecentCalledLeadStatus'),search=$('shLeadLookup');
 if(!select||!client||!userId)return;
 let requestId=0;
 const render=(rows,msg)=>{
  select.replaceChildren(new Option('No linked lead (optional)',''));
  const seen=new Set();
  for(const lead of rows||[]){
   const id=String(lead.id);if(seen.has(id))continue;seen.add(id);
   const label=window.steadyHandsFormatLeadOption?.(lead)||[lead.company||lead.name||'Customer',lead.phone].filter(Boolean).join(' · ');
   select.add(new Option(label,id));
  }
  status.textContent=msg;
 };
 const lookup=async term=>{
  const current=++requestId;select.disabled=true;
  status.textContent=term?'Searching leads…':'Loading previously called leads…';
  try{
   let rows=[];
   if(!term){
    const {data,error}=await client.from('crm').select('id,company,name,phone,lastcalled')
      .eq('assigned_user_id',userId).order('lastcalled',{ascending:false,nullsFirst:false}).limit(500);
    if(error)throw error;
    rows=data||[];
   }else{
    const q=term.replace(/[,%()\\]/g,' ').trim();
    const number=term.replace(/\D/g,'');
    const like=(number.length>=3&&/^[\d\s()+.\-]+$/.test(term))?number:q;
    const {data,error}=await client.from('crm').select('id,company,name,phone,altphone,lastcalled')
      .eq('assigned_user_id',userId).or('company.ilike.%'+like+'%,name.ilike.%'+like+'%,phone.ilike.%'+like+'%,altphone.ilike.%'+like+'%').limit(50);
    if(error)throw error;rows=data||[];
   }
   if(current!==requestId||!select.isConnected)return;
   render(rows,rows.length?(term?'Select a matching lead to link automatically.':'Your assigned leads — search by business name or phone number above.'):(term?'No matches. Try part of the business name or phone number.':'No assigned leads returned. Check CRM access or refresh.'));
  }catch(err){
   if(current===requestId&&select.isConnected)render([],'Could not search leads: '+(err.message||'Unknown error'));
  }finally{if(current===requestId&&select.isConnected)select.disabled=false;}
 };
 let debounce;search.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>lookup(search.value.trim()),300)});
 await lookup('');
}
function hideTaskModal(){const modal=$('shTaskModal');if(!modal)return;modal.remove();if(modalLastFocus?.isConnected)modalLastFocus.focus();modalLastFocus=null;}
function render(){if(!panel)return;$('shToolsTitle').textContent=panel==='notices'?'Notifications':'My Tasks';$('shToolsBody').innerHTML=panel==='notices'?notificationHTML():taskList();iconRefresh();}
async function mutate(action){try{await action();await fetchData();render()}catch(e){$('shToolsBody').insertAdjacentHTML('afterbegin',banner(e.message))}}
async function check(result){if(result.error)throw new Error(result.error.message);}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(b){if(b.id==='shTasksOpen'||b.dataset.shOpen==='tasks')open('tasks');if(b.id==='shNoticesOpen'||b.dataset.shOpen==='notices')open('notices');if(b.id==='shToolsClose')close();if(b.id==='shCreateTask')showTaskModal();if(b.id==='shCancelTask'||b.hasAttribute('data-task-modal-close'))hideTaskModal();if(b.dataset.taskFilter){filter=b.dataset.taskFilter;render();}if(b.dataset.handoffNotice){const selected=notices.find(n=>n.id===b.dataset.handoffNotice);if(selected?.handoff_id){window.location.href='index.html?handoff_id='+encodeURIComponent(selected.handoff_id);}else{const body=$('shToolsBody');body?.insertAdjacentHTML('afterbegin',banner('Handoff link not yet assigned. Ask an administrator to run the Batch 3 notification migration.'));}}if(b.dataset.taskLead){window.location.href='index.html?crm_id='+encodeURIComponent(b.dataset.taskLead);}if(b.dataset.taskDelete)await mutate(()=>client.from('outreach_tasks').delete().eq('id',b.dataset.taskDelete).eq('assigned_to',userId).then(check));if(b.dataset.noticeRead)await mutate(()=>client.from('outreach_notifications').update({read_at:new Date().toISOString()}).eq('id',b.dataset.noticeRead).eq('recipient_id',userId).then(check));if(b.id==='shReadAll')await mutate(()=>client.from('outreach_notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',userId).is('read_at',null).then(check));}
if(e.target.id==='shToolsBackdrop')close();if(e.target.hasAttribute('data-task-modal-close'))hideTaskModal();});
document.addEventListener('change',async e=>{const id=e.target.dataset?.taskToggle;if(id)await mutate(()=>client.from('outreach_tasks').update({status:e.target.checked?'done':'open',completed_at:e.target.checked?new Date().toISOString():null}).eq('id',id).eq('assigned_to',userId).then(check));});
document.addEventListener('submit',async e=>{if(e.target.id!=='shTaskForm')return;e.preventDefault();const f=new FormData(e.target),title=String(f.get('title')||'').trim();if(!title)return;const d=f.get('due');const lead=String(f.get('lead')||'').trim();const row={assigned_to:userId,created_by:userId,title,due_at:d?new Date(d).toISOString():null,priority:f.get('priority'),notes:String(f.get('notes')||'').trim(),lead_id:lead||null};try{await check(await client.from('outreach_tasks').insert(row));hideTaskModal();await fetchData();render();}catch(err){const form=$('shTaskForm');if(form){form.querySelector('.sh-tools-error')?.remove();form.insertAdjacentHTML('afterbegin',banner(err.message||'Unable to save task'));}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('shTaskModal'))hideTaskModal();else if(e.key==='Escape'&&panel)close();if(e.key==='Tab'&&$('shTaskModal')){const focusable=[...$('shTaskModal').querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
async function init(){for(let i=0;i<30;i++){if(window.steadyHandsCRMClient){client=window.steadyHandsCRMClient;break;}await new Promise(r=>setTimeout(r,350));}if(!client)return;const {data:{session}}=await client.auth.getSession();if(!session)return;userId=session.user.id;await fetchData();timer=setInterval(fetchData,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)fetchData();});}
document.addEventListener('DOMContentLoaded',init);
})();
