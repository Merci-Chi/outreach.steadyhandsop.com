/* Restore original Outreach call tools to the redesigned home page. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>window.steadyHandsCRMClient;
const lead=()=>$('#selectedLeadTop .lead-card');
const id=()=>lead()?.dataset.crmId||'';
const f=()=>({name:$('#refCompany')?.textContent||'Prospect',phone:$('#refPhone')?.textContent||'',preview:lead()?.dataset.previewUrl||lead()?.querySelector('.preview-link')?.href||''});
const msg=(root,t)=>{const p=$('.sh-sheet-status',root);if(p)p.textContent=t;};
const ic=()=>window.lucide?.createIcons?.();
function close(){document.querySelector('.sh-tool-mask')?.remove();document.body.classList.remove('sh-tool-open');}
function sheet(title,html){close();let m=document.createElement('div');m.className='sh-tool-mask';m.innerHTML=`<section class="sh-tool-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sh-sheet-handle"></div><div class="sh-sheet-head"><h2>${esc(title)}</h2><button type="button" class="sh-sheet-x" aria-label="Close">×</button></div><div class="sh-sheet-body">${html}<p class="sh-sheet-status" aria-live="polite"></p></div></section>`;document.body.appendChild(m);document.body.classList.add('sh-tool-open');$('.sh-sheet-x',m).onclick=close;m.addEventListener('click',e=>{if(e.target===m)close()});ic();return m;}
async function fetchLead(){const c=client();if(!c||!id())throw Error('Please select a lead and sign in first.');const {data,error}=await c.from('crm').select('id,company,name,notes,tags,sitekey,phone,email,assigned_user_id').eq('id',id()).single();if(error)throw error;const {data:auth}=await c.auth.getUser();if(!auth?.user||data.assigned_user_id!==auth.user.id)throw Error('This prospect is not assigned to your account.');return data;}
async function copy(v,m){try{await navigator.clipboard.writeText(v);msg(m,'Copied to clipboard.')}catch{prompt('Copy this:',v)}}
function error(m,e){console.error('Outreach tool error',e);msg(m,e.message||'Unable to complete this action.');}

function smsDraft(number,body){const to=String(number||'').replace(/[^+0-9]/g,'');if(!to)return alert('No phone number on file.');window.location.href=`sms:${to}?body=${encodeURIComponent(body)}`;}
function emailDraft(to,subject,body){window.location.href=`mailto:${encodeURIComponent(to||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;}
let alertLeadId='',lastAlertCheck=0;
async function checkSelectedLeadAlerts(){
 const leadId=id();if(!leadId||leadId===alertLeadId)return;
 alertLeadId=leadId;const stamp=++lastAlertCheck;
 try{
  const l=await fetchLead();const {data,error:e}=await client().from('outreach_notes_alerts').select('title,description').eq('crmid',l.id).eq('kind','alert').order('created_at',{ascending:false}).limit(10);
  if(e)throw e;if(stamp!==lastAlertCheck||id()!==leadId||!data?.length)return;
  const m=sheet('Alerts',`<div class="sh-alert-existing">${data.map(x=>`<div class="sh-alert-row"><b>${esc(x.title)}</b><span>${esc(x.description)}</span></div>`).join('')}</div><button type="button" class="sh-sheet-primary" id="shManageAlerts">Manage Alerts</button>`);
  $('#shManageAlerts',m).onclick=()=>openTool('alerts');
 }catch(e){console.warn('Unable to load selected lead alerts',e);}
}
const prices=[['Website Development','One-time','$100'],['Standard Hosting','per month','$20'],['Hosting + Admin Site','per month','$30']];
async function openTool(k){let m=sheet(k==='quick'?'Quick Info':k==='preview'?'Send Site Preview':k[0].toUpperCase()+k.slice(1),'<p>Loading…</p>');try{
 if(k==='quick'){m=sheet('Quick Info',`<div class="sh-prices">${prices.map(([a,b,c])=>`<div class="sh-price"><div><b>${a}</b><small>${b}</small></div><strong>${c}</strong></div>`).join('')}</div>`);return;}
 const l=await fetchLead();if(!document.body.contains(m))return;
 if(k==='notes'){
 m=sheet('Notes',`<textarea class="sh-note-input" placeholder="Add notes…">${esc(l.notes||'')}</textarea><button class="sh-sheet-primary" id="shSaveNotes">Save Notes</button>`);
 $('#shSaveNotes',m).onclick=async()=>{const b=$('#shSaveNotes',m);b.disabled=true;const {error:e}=await client().from('crm').update({notes:$('.sh-note-input',m).value}).eq('id',id()).eq('assigned_user_id',(await client().auth.getUser()).data.user.id);b.disabled=false;if(e)error(m,e);else{msg(m,'Notes saved.');setTimeout(close,550)}};return;
 }
 if(k==='alerts'){
 const {data, error:e}=await client().from('outreach_notes_alerts').select('id,title,description,userid').eq('crmid',id()).eq('kind','alert').order('created_at',{ascending:false}).limit(30);if(e)throw e;
 m=sheet('Alerts',`<input class="sh-sheet-input" id="shAlertTitle" placeholder="Alert title"><textarea class="sh-note-input sh-alert-input" id="shAlertBody" placeholder="What should the rep know?"></textarea><button class="sh-sheet-primary" id="shAddAlert">♧ Add Alert</button><div class="sh-alert-existing">${(data||[]).length?data.map(x=>`<div class="sh-alert-row"><b>${esc(x.title)}</b><span>${esc(x.description)}</span>${x.userid===window.steadyHandsToolUserId?`<button type="button" class="sh-alert-remove" data-remove-alert="${esc(x.id)}">Remove alert</button>`:''}</div>`).join(''):'No alerts for this lead yet.'}</div>`);
 m.querySelectorAll('[data-remove-alert]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {error:e}=await client().from('outreach_notes_alerts').delete().eq('id',b.dataset.removeAlert).eq('userid',window.steadyHandsToolUserId);if(e)error(m,e);else openTool('alerts')});
 $('#shAddAlert',m).onclick=async()=>{const title=$('#shAlertTitle',m).value.trim(),description=$('#shAlertBody',m).value.trim();if(!title){msg(m,'Enter an alert title.');return;}const {data:auth}=await client().auth.getUser();if(!auth.user)return msg(m,'Sign in to save.');const b=$('#shAddAlert',m);b.disabled=true;const {error:e}=await client().from('outreach_notes_alerts').insert({crmid:id(),userid:auth.user.id,kind:'alert',title,description,icon:'bi-bell-fill',author_name:auth.user.email?.split('@')[0]||''});b.disabled=false;if(e)error(m,e);else openTool('alerts')};return;
 }
 if(k==='tags'){
 let tags=l.tags;if(typeof tags==='string'){try{tags=JSON.parse(tags)}catch{tags=[]}}if(!Array.isArray(tags))tags=[];const chosen=new Set(tags);
 // Live catalog is the sole source of available tags; keep legacy lead tags visible so they can be removed.
 const {data:catalog,error:catalogError}=await client().from('crm_filter_catalog').select('name').eq('kind','tag').order('name');
 if(catalogError)throw Error('Unable to load tags from Supabase: '+catalogError.message);
 const options=[...new Set([...(catalog||[]).map(x=>x.name).filter(Boolean),...tags])];
 m=sheet('Tags',`<p class="sh-sheet-help">Tap tags to turn them on or off for this lead.</p><div class="sh-tag-options">${options.map(x=>`<button class="sh-tag-pill ${chosen.has(x)?'selected':''}" type="button" data-tag="${esc(x)}"><span class="sh-tag-check">✓</span>${esc(x)}</button>`).join('')}</div><button class="sh-sheet-primary" id="shSaveTags">Save Tags</button>`);
 m.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{const x=b.dataset.tag;if(chosen.has(x))chosen.delete(x);else chosen.add(x);b.classList.toggle('selected',chosen.has(x))});
 $('#shSaveTags',m).onclick=async()=>{const b=$('#shSaveTags',m);b.disabled=true;const {data:auth}=await client().auth.getUser();const {error:e}=await client().from('crm').update({tags:[...chosen]}).eq('id',id()).eq('assigned_user_id',auth.user.id);b.disabled=false;if(e)error(m,e);else{msg(m,'Tags saved.');setTimeout(close,500)}};return;
 }
 if(k==='preview'){
 let link='';try{link=await window.SteadyHandsPreviews.resolveLead(l)}catch(e){msg(m,e.message);return;}const message=`Hi! Here is the website preview we made for ${l.company||f().name}: ${link}`;
 m=sheet('Send Site Preview',link?`<div class="sh-preview-url">${esc(link)}</div><button class="sh-sheet-primary sh-send-green" id="shSMS">Send to This Number</button><button class="sh-sheet-secondary" id="shShare">Choose Where to Send</button><button class="sh-sheet-secondary" id="shEmailPreview">Compose Email</button><button class="sh-sheet-secondary" id="shCopy">Copy Message</button><a class="sh-sheet-secondary sh-open-preview" target="_blank" rel="noopener noreferrer" href="${esc(link)}">Open Preview</a>`:'<p>No site preview is connected to this lead.</p>');
 if(link){$('#shEmailPreview',m).onclick=()=>emailDraft(l.email||'','Your website preview',message);$('#shSMS',m).onclick=()=>smsDraft(l.phone||f().phone,message);$('#shShare',m).onclick=async()=>{if(navigator.share){try{await navigator.share({title:'Website preview',text:message,url:link})}catch{}}else copy(message,m)};$('#shCopy',m).onclick=()=>copy(message,m)}return;
 }
 if(k==='templates'){
 const company=l.company||f().name;let preview='';try{preview=await window.SteadyHandsPreviews.resolveLead(l)}catch(e){console.warn('Preview unavailable for templates:',e.message);}
 const ts=[['Site Preview Ready',`Hi! I put together a website preview for ${company}. You can view it here: ${preview||'[preview not available — ask administrator]'}`],['Pricing','Website development is $100 one-time. Hosting is $20/month, or $30/month with the admin site.'],['Follow Up',`Hi! Just following up about the website preview for ${company}. Let me know if you have any questions.`],['Ready to Move Forward',`Hi! If you would like to move forward with the website for ${company}, I can help you get everything set up.`],['References','I can share examples of our previous website work and answer any questions about the process.'],['Checking In',`Hi! Checking in to see whether you had a chance to review the website preview for ${company}.`]];
 m=sheet('Templates',`<div class="sh-template-list">${ts.map(([title,body],i)=>`<div class="sh-template-row"><span><b>${esc(title)}</b><small>${esc(body)}</small></span><div class="sh-template-actions"><button type="button" class="sh-template-copy" data-copy-template="${i}" aria-label="Copy ${esc(title)}" title="Copy ${esc(title)}"><svg class="sh-template-icon-copy" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><svg class="sh-template-icon-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span class="sh-template-copy-label">Copy</span></button><button type="button" data-sms-template="${i}" aria-label="Text ${esc(title)}">Text</button><button type="button" data-email-template="${i}" aria-label="Email ${esc(title)}">Email</button></div></div>`).join('')}</div>`);
 m.querySelectorAll('[data-copy-template]').forEach(b=>b.onclick=async()=>{
   const val=ts[Number(b.dataset.copyTemplate)][1];
   try{
     if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(val)}
     else { // Legacy browsers / local file:// testing: use the fallback copy command.
       const input=document.createElement('textarea');input.value=val;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();
       const ok=document.execCommand('copy');input.remove();if(!ok)throw Error('Copy unavailable');
     }
     b.classList.remove('is-copied');void b.offsetWidth;b.classList.add('is-copied');
     b.querySelector('.sh-template-copy-label').textContent='Copied';
     b.setAttribute('aria-label','Copied '+ts[Number(b.dataset.copyTemplate)][0]);
     clearTimeout(b._copyTimer);
     b._copyTimer=setTimeout(()=>{if(!b.isConnected)return;b.classList.remove('is-copied');b.querySelector('.sh-template-copy-label').textContent='Copy';b.setAttribute('aria-label','Copy '+ts[Number(b.dataset.copyTemplate)][0]);},1800);
     msg(m,'Copied to clipboard.');
   }catch(e){msg(m,'Could not copy automatically. Select the message text to copy it.');console.warn(e)}
 });
 m.querySelectorAll('[data-sms-template]').forEach(b=>b.onclick=()=>smsDraft(l.phone,ts[Number(b.dataset.smsTemplate)][1]));
 m.querySelectorAll('[data-email-template]').forEach(b=>b.onclick=()=>emailDraft(l.email||'',ts[Number(b.dataset.emailTemplate)][0],ts[Number(b.dataset.emailTemplate)][1]));return;
 }
 if(k==='calendar'){
 m=sheet('Add to Calendar',`<label class="sh-field-label">Follow-up date and time<input class="sh-sheet-input" id="shFollowupDate" type="datetime-local"></label><label class="sh-field-label">Note<textarea class="sh-note-input" id="shFollowupNote" placeholder="Follow-up details"></textarea></label><button class="sh-sheet-primary" id="shSaveFollowup">Save Follow-up</button><p class="sh-sheet-help">This saves the appointment in Outreach first. Then choose a calendar to add it to your device/account.</p><div id="shCalendarDestinations" hidden class="sh-calendar-destinations"><button type="button" class="sh-sheet-secondary" id="shGoogleCalendar">Open Google Calendar</button><button type="button" class="sh-sheet-secondary" id="shOutlookCalendar">Open Outlook Calendar</button><button type="button" class="sh-sheet-secondary" id="shICalendar">Add to Apple / Other Calendar (.ics)</button></div>`);
 $('#shSaveFollowup',m).onclick=async()=>{
  const raw=$('#shFollowupDate',m).value, d=new Date(raw);if(!raw||Number.isNaN(d.getTime())||d<=new Date())return msg(m,'Choose a future date and time.');
  const b=$('#shSaveFollowup',m);b.disabled=true;
  try{
   const {data:auth}=await client().auth.getUser();if(!auth.user)throw Error('Sign in to schedule a call.');
   const note=$('#shFollowupNote',m).value;const {error:e}=await client().from('callcenter_scheduled_calls').insert({user_id:auth.user.id,crm_id:l.id,company:l.company||'',contact:l.name||'',phone:l.phone||'',note,starts_at:d.toISOString(),active:true});if(e)throw e;
   msg(m,'Follow-up saved in Outreach. Choose a calendar below.');$('#shCalendarDestinations',m).hidden=false;b.textContent='Saved in Outreach';
   const title=`Follow-up: ${l.company||l.name||'Prospect'}`,endDate=new Date(d.getTime()+30*60000);
   const fmt=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
   $('#shGoogleCalendar',m).onclick=()=>window.open(`https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodeURIComponent(title)}&dates=${fmt(d)}/${fmt(endDate)}&details=${encodeURIComponent(note)}`,'_blank','noopener');
   $('#shOutlookCalendar',m).onclick=()=>window.open(`https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(d.toISOString())}&enddt=${encodeURIComponent(endDate.toISOString())}&body=${encodeURIComponent(note)}`,'_blank','noopener');
   $('#shICalendar',m).onclick=()=>{const text=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Steady Hands//Outreach//EN\r\nBEGIN:VEVENT\r\nUID:${crypto.randomUUID()}@steadyhandsop.com\r\nDTSTAMP:${fmt(new Date())}\r\nDTSTART:${fmt(d)}\r\nDTEND:${fmt(endDate)}\r\nSUMMARY:${title.replace(/[\n,;]/g,' ')}\r\nDESCRIPTION:${note.replace(/[\n,;]/g,' ')}\r\nEND:VEVENT\r\nEND:VCALENDAR`;const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/calendar'}));a.href=url;a.download='follow-up.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);};
  }catch(e){error(m,e);b.disabled=false;}
 };return;
 }
 }catch(e){error(m,e)} }
function init(){const root=$('#refOutreachMain');if(!root)return;client()?.auth?.getUser?.().then(({data})=>{window.steadyHandsToolUserId=data?.user?.id||''}).catch(()=>{});const selected=$('#selectedLeadTop');if(selected)new MutationObserver(()=>{setTimeout(checkSelectedLeadAlerts,200)}).observe(selected,{childList:true,subtree:false});setTimeout(checkSelectedLeadAlerts,1000);window.steadyHandsOpenOutreachTool=openTool;root.addEventListener('click',e=>{const b=e.target.closest('[data-ref-tool]');if(!b)return;e.stopImmediatePropagation();e.preventDefault();openTool(b.dataset.refTool)},true);document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
