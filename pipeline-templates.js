/* Pipeline messaging templates: select from signed-in salesperson's pipeline contacts. */
(()=>{'use strict';
const opener=document.getElementById('salesTemplates');if(!opener)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let contacts=[],modal=null,current=null,preview='',version=0;
const templates=(name,link)=>[
 ['Site Preview Ready',`Hi! I put together a website preview for ${name}. You can view it here: ${link||'[website preview link not available]'}`],
 ['Pricing','Website development is $100 one-time. Hosting is $20/month, or $30/month with the admin site.'],
 ['Follow Up',`Hi! Just following up about the website preview for ${name}. Let me know if you have any questions.`],
 ['Ready to Move Forward',`Hi! If you would like to move forward with the website for ${name}, I can help you get everything set up.`],
 ['References','I can share examples of our previous website work and answer any questions about the process.'],
 ['Checking In',`Hi! Checking in to see whether you had a chance to review the website preview for ${name}.`]
];
const nameOf=r=>r.company_name||r.contact_name||'Unnamed contact';
function syncContacts(data){contacts=Array.isArray(data)?data.slice().sort((a,b)=>nameOf(a).localeCompare(nameOf(b))):[];if(modal){const sel=modal.querySelector('#ptContact');const old=sel.value;fillSelect();if(contacts.some(c=>String(c.id)===old))sel.value=old;else sel.value='';selectContact();}}
window.addEventListener('sh:pipeline-contacts-updated',e=>syncContacts(e.detail));
function fillSelect(){if(!modal)return;const el=modal.querySelector('#ptContact');el.innerHTML='<option value="">Choose a pipeline contact</option>'+contacts.map(c=>`<option value="${esc(c.id)}">${esc(nameOf(c))}${c.contact_name&&c.company_name?' — '+esc(c.contact_name):''}</option>`).join('');modal.querySelector('#ptContactCount').textContent=contacts.length?`${contacts.length} contact${contacts.length===1?'':'s'} in your pipeline`:'No contacts in your pipeline yet';}
function close(){version++;modal?.remove();modal=null;document.removeEventListener('keydown',onKey)}
function onKey(e){if(e.key==='Escape')close()}
function render(){if(!modal)return;const name=current?nameOf(current):'your business';modal.querySelector('#ptList').innerHTML=templates(name,preview).map(([title,message],i)=>`<article class="pt-item"><strong>${esc(title)}</strong><p>${esc(message)}</p><div class="pt-actions"><button type="button" data-copy="${i}">Copy</button><button type="button" data-sms="${i}">Text</button><button type="button" data-email="${i}">Email</button></div></article>`).join('');modal.querySelectorAll('.pt-actions button').forEach(b=>b.disabled=!current)}
async function selectContact(){if(!modal)return;const token=++version;current=contacts.find(c=>String(c.id)===modal.querySelector('#ptContact').value)||null;preview='';const status=modal.querySelector('#ptPreviewStatus');status.textContent=current?'Checking website preview…':'Select a contact to use a template.';render();if(!current)return;
 try{const value=current.preview_url||current.website_preview_url||current.site_preview_url;if(value){preview=value;status.textContent='Website preview linked to contact.';render();return}
 const resolver=window.SteadyHandsPreviews;
 if(current.crm_id&&resolver?.resolveCRM){preview=await resolver.resolveCRM(current.crm_id)}
 else if(current.sitekey&&resolver?.resolveKey){preview=await resolver.resolveKey(current.sitekey)}
 if(token!==version||!modal)return;status.textContent=preview?'Website preview linked to contact.':'No website preview available for this contact.';
 }catch(err){if(token!==version||!modal)return;status.textContent='Preview unavailable for this contact.';console.warn('Preview lookup:',err.message)}
 render();}
function open(){close();modal=document.createElement('div');modal.className='pt-overlay';modal.innerHTML=`<section class="pt-modal" role="dialog" aria-modal="true" aria-label="Sales message templates"><header><h2>Templates</h2><button type="button" id="ptClose" aria-label="Close">×</button></header><div class="pt-scroll"><label for="ptContact">Select Contact<select id="ptContact" aria-label="Select contact"></select></label><p id="ptContactCount" class="pt-help"></p><p id="ptPreviewStatus" class="pt-help" role="status"></p><div id="ptList"></div><p id="ptStatus" role="status" aria-live="polite"></p></div></section>`;document.body.append(modal);fillSelect();modal.querySelector('#ptClose').onclick=close;modal.querySelector('#ptContact').addEventListener('change',selectContact);
 modal.addEventListener('click',async e=>{if(e.target===modal){close();return}const b=e.target.closest('[data-copy],[data-sms],[data-email]');if(!b||!current)return;const i=Number(b.dataset.copy??b.dataset.sms??b.dataset.email);const [subject,body]=templates(nameOf(current),preview)[i];if(b.hasAttribute('data-copy')){try{await navigator.clipboard.writeText(body);if(modal)modal.querySelector('#ptStatus').textContent='Copied to clipboard.'}catch{if(modal)modal.querySelector('#ptStatus').textContent='Copy failed. Select the message text instead.'}}else if(b.hasAttribute('data-sms')){const number=String(current.phone||'').replace(/[^\d+]/g,'');location.href='sms:'+number+'?body='+encodeURIComponent(body)}else location.href='mailto:'+encodeURIComponent(current.email||'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)});
 document.addEventListener('keydown',onKey);selectContact();}
 opener.addEventListener('click',open);
})();
