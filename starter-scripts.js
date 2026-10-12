/* Four visible starter scripts for the selected Outreach prospect. */
(()=>{'use strict';
const scripts={
 'no-site':g=>`${g} I was looking into your business earlier and I couldn’t find a website. I help businesses get set up with a professional site. Is that something you’re considering?`,
 broken:g=>`${g} I noticed parts of your website weren’t working properly. I can help get it fixed or rebuilt. Would you be interested?`,
 old:g=>`${g} I was looking at your website earlier and noticed it seems dated. I help businesses redesign and upgrade older sites. Would you be open to talking about it?`,
 spanish:g=>`${g} No hay problema. Un miembro de mi equipo habla español. ¿Puedo pedirle que le llame?`
};
let salesperson='';
function getClient(){return window.steadyHandsCRMClient||window.supabaseClient||window.callcenterSupabase||null;}
async function loadSalesperson(){
 try{
  const c=getClient();if(!c?.auth?.getUser)return;
  const {data}=await c.auth.getUser();const user=data?.user;if(!user)return;
  const meta=user.user_metadata||{};
  salesperson=String(meta.display_name||meta.full_name||'').trim();
  if(c.from){const {data:profile,error}=await c.from('callcenter_profiles').select('display_name').eq('user_id',user.id).maybeSingle();if(!error&&profile?.display_name)salesperson=String(profile.display_name).trim();}
  render();if(popupIsOpen()){const output=document.getElementById('shPopupScriptText');if(output){const active=document.querySelector('[data-popup-starter].is-active')?.dataset.popupStarter||'no-site';output.textContent=scripts[active](greeting());}}
 }catch(e){console.warn('Starter scripts: unable to load display name',e);}
}
function getLead(){
 const selected=document.querySelector('#selectedLeadTop .lead-card');
 const contactName=String(selected?.dataset.contactName||selected?.querySelector('.lead-title .name')?.textContent||'').trim();
 const companyName=String(selected?.dataset.company||selected?.querySelector('.lead-title h2')?.textContent||'').trim();
 return {contactName,companyName};
}
function greeting(){
 const {contactName,companyName}=getLead();
 const name=salesperson||'[your name]';
 if(contactName)return `Hey ${contactName.split(/\s+/)[0]}, my name is ${name}. I'm calling from Steady Hands.`;
 if(companyName)return `Hey, is this ${companyName}? My name is ${name}, and I'm calling from Steady Hands.`;
 return `Hey, my name is ${name}. I'm calling from Steady Hands.`;
}
function popupIsOpen(){return !!document.querySelector('.sh-script-overlay:not([hidden])');}
const root=document.querySelector('.sh-starter-card');
const launcher=document.getElementById('shOpenScripts');
if(!root&&!launcher)return;
if(launcher){
 const layer=document.createElement('div');layer.className='sh-script-overlay';layer.hidden=true;
 layer.innerHTML=`<div class="sh-script-dialog" role="dialog" aria-modal="true" aria-label="Starter scripts"><div class="sh-script-dialog-head"><div><span class="sh-starter-eyebrow">STARTER SCRIPT</span><h2>Choose what fits this lead</h2></div><button type="button" class="sh-script-close" aria-label="Close scripts">✕</button></div><div class="sh-starter-tabs" role="group" aria-label="Script type"><button type="button" data-popup-starter="no-site">No Site</button><button type="button" data-popup-starter="broken">Broken Site</button><button type="button" data-popup-starter="old">Old Site</button><button type="button" data-popup-starter="spanish">Spanish</button></div><p class="sh-starter-text" id="shPopupScriptText"></p><button class="sh-script-copy" type="button"><i data-lucide="copy"></i> Copy Script</button><span class="sh-starter-status" role="status"></span></div>`;
 document.body.appendChild(layer);
 let current='no-site';const outputPopup=layer.querySelector('#shPopupScriptText');
 function updatePopup(){outputPopup.textContent=scripts[current](greeting());layer.querySelectorAll('[data-popup-starter]').forEach(b=>{const selected=b.dataset.popupStarter===current;b.classList.toggle('is-active',selected);b.setAttribute('aria-pressed',String(selected));});}
 const close=()=>{layer.hidden=true;launcher.focus()};
 launcher.addEventListener('click',()=>{layer.hidden=false;updatePopup();layer.querySelector('.sh-script-close').focus();window.lucide?.createIcons?.()});
 layer.querySelector('.sh-script-close').addEventListener('click',close);
 layer.addEventListener('click',e=>{if(e.target===layer)close();const b=e.target.closest('[data-popup-starter]');if(b){current=b.dataset.popupStarter;updatePopup();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!layer.hidden)close()});
 layer.querySelector('.sh-script-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(outputPopup.textContent);layer.querySelector('.sh-starter-status').textContent='Copied!';}catch{layer.querySelector('.sh-starter-status').textContent='Select the text to copy.';}});
}

let active='no-site';const output=document.getElementById('shStarterText'),status=document.getElementById('shStarterStatus');
function render(){if(!root)return;output.textContent=scripts[active](greeting());root.querySelectorAll('[data-starter]').forEach(b=>{const yes=b.dataset.starter===active;b.classList.toggle('is-active',yes);b.setAttribute('aria-pressed',String(yes));});}
if(root)root.addEventListener('click',async e=>{const tab=e.target.closest('[data-starter]');if(tab){active=tab.dataset.starter;status.textContent='';render();return;}if(e.target.closest('#shStarterCopy')){try{await navigator.clipboard.writeText(output.textContent);status.textContent='Copied!';}catch{status.textContent='Select the text to copy it.';}}});
const target=document.getElementById('selectedLeadTop');if(target)new MutationObserver(render).observe(target,{childList:true,subtree:true});render();loadSalesperson();
})();
