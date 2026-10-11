(() => {'use strict';
const $=id=>document.getElementById(id);let client,user,queues=[],current=null,entries=[],editing=null;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const say=s=>{$('qMessage').textContent=s};const icons=()=>window.lucide?.createIcons?.();
async function checked(result){if(result.error)throw result.error;return result.data}

async function generate(q) {
 if(q.queue_type==='custom'){say('Custom queue saved. Add leads using Manage.');return;}
 say('Finding authorized eligible leads across the CRM…');
 const {data,error}=await client.rpc('outreach_fill_queue',{p_queue_id:q.id});
 if(error)throw error;
 say(`Added ${Number(data)||0} eligible leads to ${q.name}.`);
 await load();
}

async function setup(){client=window.steadyHandsCRMClient;if(!client&&window.supabase){client=window.supabase.createClient('https://glonbvrcudwuzjundrii.supabase.co','sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr');window.steadyHandsCRMClient=client}if(!client)throw Error('Supabase unavailable');const x=await client.auth.getUser();if(x.error||!x.data.user)throw Error('Please sign in');user=x.data.user;await load()}
async function load(){queues=await checked(await client.from('outreach_queues').select('*').eq('owner_id',user.id).order('created_at',{ascending:false}));render();say(queues.length?'':'No queues yet. Choose Create Queue to get started.')}
function render(){const box=$('qList');box.innerHTML=queues.map(q=>{const total=q.item_count||0,complete=q.completed_count||0;return `<article class="q-card"><div class="q-card-top"><h3>${esc(q.name)}</h3>${q.is_active?'<span class="q-tag">Active</span>':''}</div><p>${esc(q.queue_type)} · ${esc(q.sort_mode)} · ${total} lead${total===1?'':'s'}</p><small>${complete} of ${total} completed</small><div class="q-meter"><div style="width:${total?Math.min(100,100*complete/total):0}%"></div></div><div class="q-card-actions"><button data-act="open" data-id="${q.id}">Manage</button><button data-act="generate" data-id="${q.id}">Fill Queue</button><button data-act="activate" data-id="${q.id}">${q.is_active?'Pause':'Activate'}</button><button data-act="edit" data-id="${q.id}">Edit</button><button data-act="duplicate" data-id="${q.id}">Duplicate</button><button data-act="delete" data-id="${q.id}">Delete</button></div></article>`}).join('')||'<div class="q-empty">No queues yet. Create your first queue.</div>';icons()}
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
 $('qDetail').hidden=true;
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
async function save(e){e.preventDefault();const name=$('qName').value.trim();if(!name)return;const payload={name,queue_type:$('qType').value,sort_mode:$('qSort').value,filters:{business:$('qBusiness').value.trim(),limit:Number($('qLimit').value),preview:$('qPreviewMode').value==='only',preview_mode:$('qPreviewMode').value,exclude_called:$('qExcludeCalled').checked}};try{if(editing){await checked(await client.from('outreach_queues').update(payload).eq('id',editing.id).eq('owner_id',user.id))}else{payload.owner_id=user.id;const record=await checked(await client.from('outreach_queues').insert(payload).select('*').single());if(record.queue_type!=='custom'){try{await generate(record)}catch(generationError){console.warn('Queue generation:',generationError);say('Queue was saved, but automatic filling failed: '+generationError.message)}}}closeEditor();await load();if(payload.queue_type==='custom')say('Custom queue saved. Open Manage to add leads.')}catch(e){say('Unable to save queue: '+e.message)}}
async function act(id,action){const q=queues.find(q=>q.id===id);if(!q)return;try{if(action==='generate')return generate(q);if(action==='edit')return form(q);if(action==='open')return openQueue(q);if(action==='activate'){if(!q.is_active){await checked(await client.from('outreach_queues').update({is_active:false}).eq('owner_id',user.id).eq('is_active',true))}await checked(await client.from('outreach_queues').update({is_active:!q.is_active}).eq('id',id).eq('owner_id',user.id));await load();return}if(action==='delete'){if(!confirm(`Delete queue "${q.name}"? CRM leads will not be deleted.`))return;await checked(await client.from('outreach_queues').delete().eq('id',id).eq('owner_id',user.id));await load();return}if(action==='duplicate'){const {data:newQueue,error}=await client.from('outreach_queues').insert({owner_id:user.id,name:q.name+' (Copy)',queue_type:q.queue_type,sort_mode:q.sort_mode,filters:q.filters}).select('id').single();if(error)throw error;const all=await checked(await client.from('outreach_queue_items').select('crm_id,position').eq('queue_id',q.id).order('position').limit(1000));if(all.length)await checked(await client.from('outreach_queue_items').insert(all.map(i=>({queue_id:newQueue.id,crm_id:i.crm_id,position:i.position}))));await load();return}}catch(e){say('Queue operation failed: '+e.message)}}
async function openQueue(q){current=q;closeEditor();$('qDetail').hidden=false;$('qDetailName').textContent=q.name;$('qDetailMeta').textContent=`${q.queue_type} · ${q.sort_mode}`;$('qResults').innerHTML='';await refreshItems();$('qDetail').scrollIntoView({behavior:'smooth',block:'start'})}
async function refreshItems(){if(!current)return;try{entries=await checked(await client.from('outreach_queue_items').select('*').eq('queue_id',current.id).order('position').limit(1000));const list=$('qItems');list.innerHTML=entries.map((i,n)=>`<div class="q-item"><span>${n+1}. ${esc(i.company_name||i.crm_id)} <small>(${esc(i.status)})</small></span><div class="q-item-controls"><button data-item="up" data-idx="${n}" ${n===0?'disabled':''}>↑</button><button data-item="down" data-idx="${n}" ${n===entries.length-1?'disabled':''}>↓</button><button data-item="select" data-idx="${n}">Select</button><button data-item="skip" data-idx="${n}">${i.status==='skipped'?'Unskip':'Skip'}</button><button data-item="status" data-idx="${n}">${i.status==='completed'?'Reopen':'Complete'}</button><button data-item="remove" data-idx="${n}">Remove</button></div></div>`).join('')||'<div class="q-empty">This queue has no leads. Search the CRM above to add some.</div>';icons()}catch(e){say('Unable to load queue entries: '+e.message)}}
async function search(){const term=$('qLeadSearch').value.trim().replace(/[,%()]/g,' ');if(term.length<2){say('Enter at least two characters to search');return}try{say('Searching your authorized CRM records…');const x=await client.from('crm').select('id,company,name,phone,stage').or(`company.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%`).limit(20);const rows=(await checked(x)).filter(r=>r.stage!=='notinterested' && r.stage!=='archived' && r.stage!=='complete');$('qResults').innerHTML=rows.map(r=>`<div class="q-result"><span><strong>${esc(r.company||r.name||'Unnamed lead')}</strong> · ${esc(r.phone||'No phone')}</span><button data-add="${esc(r.id)}" data-name="${esc(r.company||r.name||'Unnamed lead')}">Add to Queue</button></div>`).join('')||'<div class="q-empty">No authorized leads matched.</div>';say('');}catch(e){say('CRM search unavailable: '+e.message)}}
async function add(id,name){if(!current)return;try{if(entries.some(x=>String(x.crm_id)===String(id))){say('Lead already in this queue');return}await checked(await client.from('outreach_queue_items').insert({queue_id:current.id,crm_id:String(id),company_name:name,position:entries.length+1}));await refreshItems();await load();say('Lead added to queue')}catch(e){say('Could not add lead: '+e.message)}}
async function updateItem(action,index){const i=entries[index];if(!i)return;try{if(action==='select'){sessionStorage.setItem('steadyhands-selected-outreach-crm-id',String(i.crm_id));location.href='index.html?crm_id='+encodeURIComponent(i.crm_id);return;}if(action==='skip')await checked(await client.from('outreach_queue_items').update({status:i.status==='skipped'?'pending':'skipped'}).eq('id',i.id));if(action==='remove')await checked(await client.from('outreach_queue_items').delete().eq('id',i.id));if(action==='status')await checked(await client.from('outreach_queue_items').update({status:i.status==='completed'?'pending':'completed'}).eq('id',i.id));if(action==='up'||action==='down'){const other=entries[index+(action==='up'?-1:1)];if(!other)return;const pos=i.position;await checked(await client.from('outreach_queue_items').update({position:other.position}).eq('id',i.id));await checked(await client.from('outreach_queue_items').update({position:pos}).eq('id',other.id))}await refreshItems();await load()}catch(e){say('Cannot update queue item: '+e.message)}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act],[data-add],[data-item]');if(!b)return;if(b.dataset.act)act(b.dataset.id,b.dataset.act);if(b.dataset.add)add(b.dataset.add,b.dataset.name);if(b.dataset.item)updateItem(b.dataset.item,Number(b.dataset.idx))});$('qCreate').onclick=()=>form(null);$('qClose').onclick=$('qCancel').onclick=closeEditor;$('qDetailClose').onclick=()=>{$('qDetail').hidden=true;current=null};$('qEditorOverlay').addEventListener('click',e=>{if(e.target===$('qEditorOverlay'))closeEditor()});
document.addEventListener('keydown',e=>{
 const overlay=$('qEditorOverlay');if(overlay.hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeEditor();return;}
 if(e.key==='Tab'){
  const nodes=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')].filter(el=>el.getClientRects().length);
  if(!nodes.length)return;
  const first=nodes[0],last=nodes[nodes.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
});
$('qForm').onsubmit=save;$('qSearchButton').onclick=search;$('qLeadSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search()}});
setup().catch(e=>say('Queue setup unavailable. Sign in and run the separate Supabase SQL first. '+e.message));
})();