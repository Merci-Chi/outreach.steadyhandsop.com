/* Synchronize Outreach star buttons with private Supabase stars. */
(()=>{'use strict';
const client=()=>window.steadyHandsCRMClient;
let uid=null,starred=new Set(),loaded=false,busy=new Set();
const cards=()=>[...document.querySelectorAll('.lead-card[data-crm-id]')];
function paint(){if(!loaded)return;for(const card of cards()){
 const id=card.dataset.crmId,star=card.querySelector('.star-button');if(!star||!id)continue;
 const on=starred.has(id);star.classList.toggle('favorite',on);star.setAttribute('aria-pressed',String(on));star.setAttribute('aria-label',on?'Unstar company':'Star company');
}}
async function refresh(){const c=client();if(!c)return;const {data:{user}={},error}=await c.auth.getUser();if(error||!user)return;uid=user.id;
 const ids=new Set();let from=0;
 while(from<10000){const {data,error:e}=await c.from('outreach_lead_stars').select('crm_id').eq('user_id',uid).order('crm_id').range(from,from+999);if(e){console.warn('Star sync unavailable',e);return;}for(const r of data||[])ids.add(String(r.crm_id));if(!data||data.length<1000)break;from+=1000;}
 starred=ids;loaded=true;paint();}
document.addEventListener('click',e=>{
 const star=e.target.closest?.('.star-button');const id=star?.closest('.lead-card')?.dataset.crmId;
 if(!id||!loaded||!uid)return;
 // Existing app handler also toggles local stars; sync to database after it runs.
 if(busy.has(id))return;
 const target=!starred.has(id);starred[target?'add':'delete'](id);busy.add(id);
 queueMicrotask(paint);
 const c=client();const request=target?c.from('outreach_lead_stars').upsert({user_id:uid,crm_id:id},{onConflict:'user_id,crm_id'}):c.from('outreach_lead_stars').delete().eq('user_id',uid).eq('crm_id',id);
 Promise.resolve(request).then(({error})=>{if(error)throw error}).catch(err=>{console.warn('Could not save star',err);starred[target?'delete':'add'](id);alert('Unable to save star to CRM.');}).finally(()=>{busy.delete(id);paint();});
},true);
const observer=new MutationObserver(()=>{if(loaded)paint()});
const start=()=>{observer.observe(document.body,{childList:true,subtree:true});refresh()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
window.addEventListener('pageshow',refresh);
})();
