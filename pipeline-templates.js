/* Pipeline messaging templates: select from signed-in salesperson's pipeline contacts. */
(()=>{'use strict';
const opener=document.getElementById('salesTemplates');if(!opener)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let contacts=[],modal=null,current=null,preview='',version=0;
const templates=(name,link)=>[
 ['Site Preview Ready',`Hi! I put together a website preview for ${name}. You can view it here: ${link||'[website preview link not available]'}`],
 ['Pricing','Website development is $100 one-time. Standard hosting is $20/month. Business hosting is $30/month.'],
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
function render(){if(!modal)return;const name=current?nameOf(current):'your business';modal.querySelector('#ptList').innerHTML=templates(name,preview).map(([title,message],i)=>`<article class="pt-item"><strong>${esc(title)}</strong><p>${esc(message)}</p><div class="pt-actions"><button type="button" data-copy="${i}">Copy</button><button type="button" data-sms="${i}">Text</button><button type="button" data-email="${i}">Email</button></div></article>`).join('');modal.querySelectorAll('.pt-actions button').forEach(b=>b.disabled=!current||(!preview&&Number(b.dataset.copy??b.dataset.sms??b.dataset.email)===0))}
async function resolveContactPreview(contact){
 const resolver=window.SteadyHandsPreviews;
 if(contact?.crm_id&&resolver?.resolveCRM)return resolver.resolveCRM(contact.crm_id);
 if(contact?.sitekey&&resolver?.resolveKey)return resolver.resolveKey(contact.sitekey,{fresh:true});
 throw new Error('Link this contact to a CRM lead with an active site key first.');
}
async function selectContact(){
 if(!modal)return;const token=++version;
 current=contacts.find(c=>String(c.id)===modal.querySelector('#ptContact').value)||null;preview='';
 const chosen=current,status=modal.querySelector('#ptPreviewStatus');
 status.textContent=chosen?'Checking the existing site key…':'Select a contact to use a template.';render();if(!chosen)return;
 try{
  const resolved=await resolveContactPreview(chosen);
  if(token!==version||!modal||current!==chosen)return;
  preview=resolved;status.textContent='Preview verified using the existing site key.';
 }catch(err){if(token!==version||!modal||current!==chosen)return;status.textContent='Preview unavailable: '+err.message;console.warn('Preview lookup:',err.message);}
 render();
}
async function sendTemplate(button){
 if(!current||!modal)return;
 const chosen=current,token=version,index=Number(button.dataset.copy??button.dataset.sms??button.dataset.email);
 let link=preview;
 try{
  if(index===0){button.disabled=true;link=await resolveContactPreview(chosen);if(!modal||current!==chosen||version!==token)return;preview=link;}
  const [subject,body]=templates(nameOf(chosen),link)[index]||[];if(!subject)return;
  if(button.hasAttribute('data-copy')){
   await navigator.clipboard.writeText(body);
   if(modal&&current===chosen)modal.querySelector('#ptStatus').textContent='Copied to clipboard.';
  }else if(button.hasAttribute('data-sms')){
   const number=String(chosen.phone||'').replace(/[^\d+]/g,'');if(!number)throw new Error('This contact has no textable phone number.');
   location.href='sms:'+number+'?body='+encodeURIComponent(body);
  }else location.href='mailto:'+encodeURIComponent(chosen.email||'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 }catch(error){if(modal&&current===chosen)modal.querySelector('#ptStatus').textContent='Not sent: '+error.message;}
 finally{if(modal&&current===chosen&&version===token)render();}
}
function open(){close();modal=document.createElement('div');modal.className='pt-overlay';modal.innerHTML=`<section class="pt-modal" role="dialog" aria-modal="true" aria-label="Sales message templates"><header><h2>Templates</h2><button type="button" id="ptClose" aria-label="Close">×</button></header><div class="pt-scroll"><label for="ptContact">Select Contact<select id="ptContact" aria-label="Select contact"></select></label><p id="ptContactCount" class="pt-help"></p><p id="ptPreviewStatus" class="pt-help" role="status"></p><div id="ptList"></div><p id="ptStatus" role="status" aria-live="polite"></p></div></section>`;document.body.append(modal);fillSelect();modal.querySelector('#ptClose').onclick=close;modal.querySelector('#ptContact').addEventListener('change',selectContact);
 modal.addEventListener('click',async e=>{if(e.target===modal){close();return;}const b=e.target.closest('[data-copy],[data-sms],[data-email]');if(b)await sendTemplate(b);});
 document.addEventListener('keydown',onKey);selectContact();}
 opener.addEventListener('click',open);
})();

