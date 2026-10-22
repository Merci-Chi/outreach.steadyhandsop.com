(() => {'use strict';
const $=id=>document.getElementById(id);let client,user,queues=[],current=null,entries=[],editing=null;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const say=s=>{$('qMessage').textContent=s};const icons=()=>window.lucide?.createIcons?.();
async function checked(result){if(result.error)throw result.error;return result.data}

async function generate(q) {
 say('Finding eligible assigned leads…');
 const f=q.filters||{}, cap=Math.min(1000,Math.max(1,Number(f.limit)||25));
 const prior=await checked(await client.from('outreach_queue_items').select('crm_id,position,status').eq('queue_id',q.id).order('position').limit(1000));
 const inQueue=new Set(prior.map(x=>String(x.crm_id)));
 const remaining=Math.max(0,cap-prior.filter(x=>x.status!=='completed').length);
 if(!remaining){say('Queue is already at its selected size.');return;}
 let query=client.from('crm').select('id,company,name,phone,stage,sitekey,created,lastcalled,tags,outcome,do_not_call,admin_archived,call_status,callbackdate,callbackat')
  .eq('assigned_user_id',user.id).eq('admin_archived',false).limit(1000);
 if(f.business)query=query.ilike('company',`%${String(f.business).replace(/[%,]/g,'')}%`);
 if(f.exclude_called)query=query.is('lastcalled',null);
 if(f.preview)query=query.not('sitekey','is',null);
 const rows=await checked(await query.order('created',{ascending:q.sort_mode!=='newest'}));
 let starred=null;
 if(q.queue_type==='starred'){const stars=await checked(await client.from('outreach_lead_stars').select('crm_id').eq('user_id',user.id).limit(1000));starred=new Set(stars.map(x=>String(x.crm_id)));}
 let allowed=rows.filter(r=>r.phone&&!window.SteadyHandsLeadDisposition.callBlocked(r)&&(!starred||starred.has(String(r.id)))&&(q.queue_type!=='callback'||r.callbackdate||r.callbackat||window.SteadyHandsLeadDisposition.hasContact(r))&&!inQueue.has(String(r.id))&&(!f.exclude_called||window.SteadyHandsLeadDisposition.callStatus(r)!=='Called')&&!['notinterested','not interested','do not call','donotcall','archived','sold','complete','completed','cancelled'].includes(String(r.stage||'').trim().toLowerCase()));
 const mode=q.sort_mode;
 if(mode==='random')allowed=allowed.map(v=>({v,k:Math.random()})).sort((a,b)=>a.k-b.k).map(x=>x.v);
 else if(mode==='az')allowed.sort((a,b)=>String(a.company||a.name||'').localeCompare(String(b.company||b.name||'')));
 else if(mode==='za')allowed.sort((a,b)=>String(b.company||b.name||'').localeCompare(String(a.company||a.name||'')));

 const selected=allowed.slice(0,remaining);
 const maxPosition=Math.max(0,...prior.map(x=>Number(x.position)||0));
 const fresh=selected.map((r,i)=>({queue_id:q.id,crm_id:String(r.id),company_name:r.company||r.name||'',position:maxPosition+i+1}));
 if(fresh.length)await checked(await client.from('outreach_queue_items').upsert(fresh,{onConflict:'queue_id,crm_id',ignoreDuplicates:true}));
 await load();say(`Added ${fresh.length} assigned leads to ${q.name}.`);
}

async function setup(){client=window.steadyHandsCRMClient;if(!client&&window.supabase){client=window.supabase.createClient('https://glonbvrcudwuzjundrii.supabase.co','sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr');window.steadyHandsCRMClient=client}if(!client)throw Error('Supabase unavailable');const x=await client.auth.getUser();if(x.error||!x.data.user)throw Error('Please sign in');user=x.data.user;await load()}
async function load(){queues=await checked(await client.from('outreach_queues').select('*').eq('owner_id',user.id).order('created_at',{ascending:false}));render();say(queues.length?'':'No queues yet. Choose Create Queue to get started.')}
let selectedQueueId=null;
function selectedQueue(){return queues.find(q=>String(q.id)===String(selectedQueueId))||queues.find(q=>q.is_active)||queues[0]||null}
function render(){
 const q=selectedQueue();selectedQueueId=q?.id||null;
 $('qList').innerHTML=queues.map(v=>`<button type="button" class="q-queue-tile ${q&&v.id===q.id?'is-selected':''}" data-choose="${esc(v.id)}"><i data-lucide="${v.is_active?'check-circle-2':'layers'}"></i><span>${esc(v.name)}</span><small>${v.is_active?'Active':'Inactive'}</small><i data-lucide="chevron-right"></i></button>`).join('')||'<div class="q-empty">No queues yet. Use + to create one.</div>';
 $('qActiveSetting').disabled=stateBusy||!q; $('qActiveSetting').checked=!!q?.is_active;
 $('qActiveStatus').textContent=q?(q.is_active?'Active':'Inactive'):'Inactive';
 $('qEditSelected').disabled=!q;$('qManage').disabled=!q;$('qAddLeads').disabled=false;
 $('qAutoAddSetting').disabled=!q;$('qAutoAddSetting').checked=!!q?.filters?.auto_add;
 $('qSizeSetting').disabled=!q;$('qExcludeSetting').disabled=!q;
 $('qSizeSetting').value=String([10,25,50,100].includes(Number(q?.filters?.limit))?q.filters.limit:25);
 $('qExcludeSetting').checked=!!q?.filters?.exclude_called;
 document.querySelectorAll('#qOrderSetting [data-sort]').forEach(b=>{b.disabled=!q;b.classList.toggle('is-selected',b.dataset.sort===q?.sort_mode)});
 if(!q){entries=[];paintQueueItems([]);icons();return}entries=[];paintQueueItems([]);previewItems(q);icons();
}
function paintQueueItems(rows){
 const complete=rows.filter(i=>i.called).length,total=rows.length;
 $('qTotal').textContent=total;$('qComplete').textContent=complete;$('qRemaining').textContent=total-complete;
 $('qProgress').style.width=(total?Math.round(complete/total*100):0)+'%';$('qPercent').textContent=(total?Math.round(complete/total*100):0)+'% called';
 $('qItemsPreview').innerHTML=rows.map((i,n)=>`<div class="q-preview-row"><span class="q-grip" aria-hidden="true"><i data-lucide="grip-vertical"></i></span><span class="q-lead-avatar"><i data-lucide="building-2"></i></span><div class="q-lead-main"><strong>${esc(i.company_name||'Assigned prospect')}</strong></div><span class="q-contact-status" data-call-status="${i.called?'Called':'Not called'}"><small>Call status</small><strong>${i.called?'Called':'Not called'}</strong></span><span class="q-position">#${n+1}</span><div class="q-lead-actions"><button type="button" title="Move up" aria-label="Move ${esc(i.company_name||'lead')} up" data-preview-act="up" data-index="${n}" ${n===0?'disabled':''}><i data-lucide="arrow-up"></i><span>Move</span></button><button type="button" title="Details" data-preview-act="details" data-index="${n}"><i data-lucide="eye"></i><span>Details</span></button><button type="button" title="Remove from queue" data-preview-act="remove" data-index="${n}"><i data-lucide="trash-2"></i><span>Remove</span></button></div></div>`).join('')||'<div class="q-empty q-empty-action"><span class="q-empty-icon"><i data-lucide="list-plus"></i></span><strong>Your queue is empty</strong><p>Only leads you add manually will appear here unless Auto Add is enabled.</p><a class="q-empty-leads-link" href="leads.html"><i data-lucide="plus"></i> Add leads to queue</a></div>';icons();
}
async function previewItems(q){try{const rows=await checked(await client.from('outreach_queue_items').select('id,crm_id,company_name,status,position').eq('queue_id',q.id).order('position').limit(1000));const ids=rows.map(i=>i.crm_id);const leads=ids.length?await checked(await client.from('crm').select('id,company,name,created,lastcalled,tags,outcome,call_status').eq('assigned_user_id',user.id).in('id',ids)):[];const called=new Set(leads.filter(r=>window.SteadyHandsLeadDisposition.callStatus(r)==='Called').map(r=>String(r.id)));const byId=new Map(leads.map(r=>[String(r.id),r]));for(const row of rows){row.called=called.has(String(row.crm_id));row.created=byId.get(String(row.crm_id))?.created||'';row.company_name=byId.get(String(row.crm_id))?.company||byId.get(String(row.crm_id))?.name||row.company_name;}
 if(q.sort_mode==='az'||q.sort_mode==='za')rows.sort((a,b)=>(q.sort_mode==='az'?1:-1)*String(a.company_name||'').localeCompare(String(b.company_name||'')));
 if(q.sort_mode==='newest'||q.sort_mode==='oldest')rows.sort((a,b)=>(q.sort_mode==='newest'?-1:1)*(String(a.created).localeCompare(String(b.created))||String(a.crm_id).localeCompare(String(b.crm_id))));if(String(selectedQueueId)===String(q.id)){entries=rows;paintQueueItems(rows)}}catch(e){say('Could not load queue entries: '+e.message)}}
async function chooseQueue(id){const q=queues.find(x=>String(x.id)===String(id));if(!q)return;selectedQueueId=q.id;render();}
let stateBusy=false;
async function setQueueActive(q,enabled){
 if(!q||stateBusy)return;stateBusy=true;$('qActiveSetting').disabled=true;
 try{
  await checked(await client.rpc('outreach_set_queue_active',{p_queue_id:q.id,p_active:enabled}));
  selectedQueueId=q.id;await load();
  say(`${q.name} is now ${enabled?'Active':'Inactive'}.`);
  if(enabled&&q.filters?.auto_add===true){try{await generate(q)}catch(error){say(q.name+' is Active, but Auto Add failed: '+error.message)}}
 }catch(e){say('Could not change queue status: '+e.message);$('qActiveSetting').checked=!!selectedQueue()?.is_active;}
 finally{stateBusy=false;$('qActiveSetting').disabled=!selectedQueue();$('qActiveSetting').checked=!!selectedQueue()?.is_active;}
}
async function changeSetting(patch){const q=selectedQueue();if(!q)return;try{await checked(await client.from('outreach_queues').update(patch).eq('id',q.id).eq('owner_id',user.id));await load()}catch(e){say('Could not save settings: '+e.message)}}
let editorReturnFocus=null;
function closeEditor(){
 $('qEditorOverlay').hidden=true;
 document.body.classList.remove('q-modal-open');
 editorReturnFocus?.focus?.({preventScroll:true});
 editorReturnFocus=null;
}
function form(q){
 editorReturnFocus=document.activeElement;
 editing=q||null;
 $('qEditorTitle').textContent=q?'Edit Queue':'Create Queue';
 $('qName').value=q?.name||'';
 $('qType').value=q?.queue_type||'filtered';
 $('qSort').value=q?.sort_mode||'random';
 $('qBusiness').value=q?.filters?.business||'';
 $('qLimit').value=String(q?.filters?.limit||25);
 $('qNoPreview').checked=!!q?.filters?.preview; $('qPreviewMode').value=q?.filters?.preview_mode||(q?.filters?.preview?'only':'only');
 $('qExcludeCalled').checked=!!q?.filters?.exclude_called;
 $('qEditorOverlay').hidden=false;
 document.body.classList.add('q-modal-open');
 $('qEditor').scrollTop=0;
 $('qName').focus({preventScroll:true});
 icons();
}
async function save(e){e.preventDefault();const name=$('qName').value.trim();if(!name)return;const payload={name,queue_type:$('qType').value,sort_mode:$('qSort').value,filters:{business:$('qBusiness').value.trim(),limit:Number($('qLimit').value),preview:$('qPreviewMode').value==='only',preview_mode:$('qPreviewMode').value,exclude_called:$('qExcludeCalled').checked,auto_add:editing?.filters?.auto_add===true}};try{if(editing){await checked(await client.from('outreach_queues').update(payload).eq('id',editing.id).eq('owner_id',user.id))}else{payload.owner_id=user.id;const record=await checked(await client.from('outreach_queues').insert(payload).select('*').single());/* All new queues start empty. Auto Add is always off by default. */}closeEditor();await load();if(payload.queue_type==='custom')say('Custom queue saved. Open Manage to add leads.')}catch(e){say('Unable to save queue: '+e.message)}}
async function act(id,action){const q=queues.find(q=>q.id===id);if(!q)return;try{if(action==='generate')return generate(q);if(action==='edit')return form(q);if(action==='open')return form(q);if(action==='activate')return setQueueActive(q,!q.is_active);if(action==='delete'){if(!confirm(`Delete queue "${q.name}"? CRM leads will not be deleted.`))return;await checked(await client.from('outreach_queues').delete().eq('id',id).eq('owner_id',user.id));await load();return}if(action==='duplicate'){const {data:newQueue,error}=await client.from('outreach_queues').insert({owner_id:user.id,name:q.name+' (Copy)',queue_type:q.queue_type,sort_mode:q.sort_mode,filters:q.filters}).select('id').single();if(error)throw error;const all=await checked(await client.from('outreach_queue_items').select('crm_id,position').eq('queue_id',q.id).order('position').limit(1000));if(all.length)await checked(await client.from('outreach_queue_items').insert(all.map(i=>({queue_id:newQueue.id,crm_id:i.crm_id,position:i.position}))));await load();return}}catch(e){say('Queue operation failed: '+e.message)}}
let clientInfoReturnFocus=null;
function closeClientInfo(){ $('qClientOverlay').hidden=true; document.body.classList.remove('q-modal-open');clientInfoReturnFocus?.focus?.({preventScroll:true});clientInfoReturnFocus=null; }
const detailField=(label,value)=>`<div class="q-client-field"><span>${esc(label)}</span><strong>${esc(value===null||value===undefined||value===''?'Not provided':value)}</strong></div>`;
async function showClientInfo(item){
 clientInfoReturnFocus=document.activeElement;
 $('qClientOverlay').hidden=false;document.body.classList.add('q-modal-open');
 $('qClientTitle').textContent=item.company_name||'Prospect information';
 $('qClientContent').innerHTML='<p class="q-client-loading">Loading assigned prospect information…</p>';
 $('qClientClose').focus({preventScroll:true});icons();
 try{
  const lead=await checked(await client.from('crm').select('*').eq('id',item.crm_id).eq('assigned_user_id',user.id).single());
  if($('qClientOverlay').hidden)return;
  $('qClientTitle').textContent=lead.company||lead.name||item.company_name||'Prospect information';
  $('qClientContent').innerHTML=`<div class="q-client-fields">${detailField('Contact name',lead.name)}${detailField('Business',lead.company)}${detailField('Phone',lead.phone)}${detailField('Email',lead.email)}${detailField('Call status',window.SteadyHandsLeadDisposition.callStatus(lead))}${detailField('Pipeline stage',window.SteadyHandsLeadDisposition.displayStage(lead))}${detailField('Source',lead.source)}${detailField('Address',[lead.address,lead.city,lead.state,lead.zip].filter(Boolean).join(', '))}${detailField('Site key',lead.sitekey)}${detailField('Last contacted',lead.lastcalled?new Date(lead.lastcalled).toLocaleString():'Never')}${detailField('Added',lead.created_at?new Date(lead.created_at).toLocaleDateString():'Unknown')}</div>${lead.notes?`<div class="q-client-notes"><span>Notes</span><p>${esc(lead.notes)}</p></div>`:''}`;
 }catch(error){
  $('qClientContent').innerHTML=`<p class="q-client-error">Could not load this assigned prospect's information: ${esc(error.message)}</p>`;
 }
}
async function updateItem(action,index){const i=entries[index];if(!i)return;try{
 if(action==='remove')await checked(await client.from('outreach_queue_items').delete().eq('id',i.id));
 if(action==='up'||action==='down'){
 const other=entries[index+(action==='up'?-1:1)];if(!other)return;
 const q=selectedQueue();if(q&&q.sort_mode!=='manual')await checked(await client.from('outreach_queues').update({sort_mode:'manual'}).eq('id',q.id).eq('owner_id',user.id));
 const ordered=[...entries],otherIndex=index+(action==='up'?-1:1);[ordered[index],ordered[otherIndex]]=[ordered[otherIndex],ordered[index]];
 for(let n=0;n<ordered.length;n++)await checked(await client.from('outreach_queue_items').update({position:n+1}).eq('id',ordered[n].id));
 }
 await load();
 }catch(e){say('Cannot update queue item: '+e.message)} }
document.addEventListener('click',e=>{const b=e.target.closest('[data-act],[data-add],[data-item]');if(!b)return;if(b.dataset.act)act(b.dataset.id,b.dataset.act);});$('qCreate').onclick=()=>form(null);$('qClose').onclick=$('qCancel').onclick=closeEditor;$('qClientClose').onclick=closeClientInfo;$('qClientOverlay').addEventListener('click',e=>{if(e.target===$('qClientOverlay'))closeClientInfo()});$('qEditorOverlay').addEventListener('click',e=>{if(e.target===$('qEditorOverlay'))closeEditor()});
document.addEventListener('keydown',e=>{
 if(!$('qClientOverlay').hidden){if(e.key==='Escape'){e.preventDefault();closeClientInfo()}return;}const overlay=$('qEditorOverlay');if(overlay.hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeEditor();return;}
 if(e.key==='Tab'){
  const nodes=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')].filter(el=>el.getClientRects().length);
  if(!nodes.length)return;
  const first=nodes[0],last=nodes[nodes.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
});
$('qForm').onsubmit=save;
$('qAddLeads').onclick=()=>{location.href='leads.html'};

$('qActiveSetting').onchange=e=>setQueueActive(selectedQueue(),e.target.checked);
$('qManage').onclick=()=>{const q=selectedQueue();if(q)form(q)};
$('qEditSelected').onclick=()=>{const q=selectedQueue();if(q)form(q)};
$('qSizeSetting').onchange=e=>{const q=selectedQueue();if(q)changeSetting({filters:{...q.filters,limit:Number(e.target.value)}})};
$('qAutoAddSetting').onchange=async e=>{const q=selectedQueue();if(!q){e.target.checked=false;return;}const enabled=e.target.checked;await changeSetting({filters:{...q.filters,auto_add:enabled}});if(enabled){const updated=selectedQueue();if(updated?.is_active&&updated?.filters?.auto_add)generate(updated).catch(err=>say('Auto Add failed: '+err.message))}};
$('qExcludeSetting').onchange=e=>{const q=selectedQueue();if(q)changeSetting({filters:{...q.filters,exclude_called:e.target.checked}})};
document.getElementById('qOrderSetting').onclick=e=>{const button=e.target.closest('[data-sort]');if(button)changeSetting({sort_mode:button.dataset.sort})};
document.getElementById('qList').onclick=e=>{const button=e.target.closest('[data-choose]');if(button)chooseQueue(button.dataset.choose)};
document.getElementById('qItemsPreview').onclick=async e=>{const button=e.target.closest('[data-preview-act]');if(!button)return;const q=selectedQueue();if(!q)return;const idx=Number(button.dataset.index);const item=entries[idx];if(!item)return;if(button.dataset.previewAct==='details'){await showClientInfo(item);return}await updateItem(button.dataset.previewAct,idx);};
window.addEventListener('focus',()=>{const q=selectedQueue();if(q)previewItems(q)});
window.addEventListener('steadyhands:activity-updated',()=>{const q=selectedQueue();if(q)previewItems(q)});
setup().catch(e=>say('Queue setup unavailable. Sign in and run the separate Supabase SQL first. '+e.message));
})();