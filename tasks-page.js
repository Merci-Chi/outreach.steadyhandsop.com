(()=>{'use strict';const $=id=>document.getElementById(id);let client,userId,rows=[],filter='all',busy=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>d?new Date(d).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'No due date';
const isToday=d=>d&&new Date(d).toDateString()===new Date().toDateString();
const isPast=d=>d&&new Date(d).getTime()<Date.now();
function message(s){$('tasksMessage').textContent=s||'';}
function paint(){
 const open=rows.filter(t=>t.status!=='done'),done=rows.filter(t=>t.status==='done');
 $('statOpen').textContent=open.length;$('statToday').textContent=open.filter(t=>isToday(t.due_at)).length;$('statDone').textContent=done.length;
 document.querySelectorAll('[data-filter]').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false')});
 const shown=rows.filter(t=>filter==='completed'?t.status==='done':filter==='today'?t.status!=='done'&&isToday(t.due_at):filter==='upcoming'?t.status!=='done'&&(!t.due_at||!isToday(t.due_at)&&!isPast(t.due_at)):true);
 $('tasksList').innerHTML=shown.map(t=>'<article class="task-card '+(t.status==='done'?'task-completed':'')+'"><input type="checkbox" data-done="'+esc(t.id)+'" aria-label="Complete '+esc(t.title)+'" '+(t.status==='done'?'checked':'')+'><div class="task-info"><strong>'+esc(t.title)+'</strong>'+(t.notes?'<p>'+esc(t.notes)+'</p>':'')+'<div class="task-metadata"><span>'+esc(date(t.due_at))+'</span><span class="task-tag '+(t.priority==='high'?'high':'')+'">'+esc(t.priority||'normal')+'</span>'+(t.lead_id?'<a href="index.html?crm_id='+encodeURIComponent(t.lead_id)+'">Open prospect →</a>':'')+'</div></div></article>').join('')||'<p class="tasks-empty">No tasks in this view. Use New Task to add one.</p>';
}
async function refresh(){if(!client||!userId)return;const {data,error}=await client.from('outreach_tasks').select('*').eq('assigned_to',userId).order('created_at',{ascending:false}).limit(250);if(error){message('Unable to load tasks: '+error.message);return;}rows=data||[];message('');paint()}
let leadRequest=0,leadTimer;
function leadHint(value){$('taskLeadHint').textContent=value;}
async function loadLeads(){
 if(!client||!userId)return;
 const request=++leadRequest,term=$('taskLeadSearch').value.trim(),sort=$('taskLeadSort').value,select=$('taskLeadSelect'),previous=select.value;
 select.disabled=true;leadHint('Loading your assigned leads…');
 let query=client.from('crm').select('id,company,name,phone,updated,created')
   .eq('assigned_user_id',userId).eq('admin_archived',false);
 if(term){
   const needle=term.replace(/[,%()]/g,' ').trim();
   if(needle)query=query.or('company.ilike.%'+needle+'%,name.ilike.%'+needle+'%,phone.ilike.%'+needle+'%');
 }
 const order=sort==='company'?'company':sort==='contact'?'name':'updated';
 const {data,error}=await query.order(order,{ascending:sort!=='recent',nullsFirst:false}).limit(100);
 if(request!==leadRequest)return;
 select.replaceChildren(new Option('No linked lead',''));
 if(error){leadHint('Unable to load leads: '+error.message);select.disabled=false;return;}
 for(const lead of data||[]){
   const label=[lead.company||lead.name||'Unnamed business',lead.company&&lead.name?lead.name:'',lead.phone||''].filter(Boolean).join(' · ');
   select.add(new Option(label,String(lead.id)));
 }
 if([...select.options].some(option=>option.value===previous))select.value=previous;
 select.disabled=false;leadHint((data||[]).length===100?'Showing first 100 matches. Search to narrow results.':(data||[]).length+' assigned leads found.');
}
function modal(open){$('taskModal').hidden=!open;if(open){$('newTaskForm').querySelector('[name=title]').focus();void loadLeads();}}
$('taskLeadSearch').addEventListener('input',()=>{clearTimeout(leadTimer);leadTimer=setTimeout(loadLeads,250);});
$('taskLeadSort').addEventListener('change',loadLeads);
async function init(){for(let i=0;i<40&&!window.steadyHandsCRMClient;i++)await new Promise(r=>setTimeout(r,250));client=window.steadyHandsCRMClient;if(!client){message('Could not initialize tasks. Reload the page.');return;}const {data:{session},error}=await client.auth.getSession();if(error||!session){message('Please sign in to see your tasks.');return;}userId=session.user.id;await refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(()=>{if(!document.hidden)refresh()},60000);}
document.addEventListener('click',e=>{if(e.target.closest('#addTask'))modal(true);if(e.target.closest('#closeTask'))modal(false);const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;paint()}if(e.target===$('taskModal'))modal(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')modal(false)});
document.addEventListener('change',async e=>{const box=e.target.closest('[data-done]');if(!box||busy)return;busy=true;box.disabled=true;const {error}=await client.from('outreach_tasks').update({status:box.checked?'done':'open',completed_at:box.checked?new Date().toISOString():null}).eq('id',box.dataset.done).eq('assigned_to',userId);if(error)message('Unable to update: '+error.message);await refresh();busy=false});
$('newTaskForm').addEventListener('submit',async e=>{e.preventDefault();if(busy||!client||!userId)return;const fd=new FormData(e.target),title=String(fd.get('title')||'').trim();if(!title)return;busy=true;const button=e.target.querySelector('[type=submit]');button.disabled=true;const due=fd.get('due_at'),lead=String(fd.get('lead_id')||'').trim();const {error}=await client.from('outreach_tasks').insert({assigned_to:userId,created_by:userId,title,notes:String(fd.get('notes')||'').trim(),due_at:due?new Date(due).toISOString():null,priority:fd.get('priority'),lead_id:lead||null});busy=false;button.disabled=false;if(error){message('Unable to create task: '+error.message);return;}e.target.reset();modal(false);await refresh()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();