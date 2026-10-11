/* Batch 9: route lead browsing to Leads, keep the Outreach workspace selected-only. */
(() => {
 'use strict';
 const onLeads = document.body.classList.contains('page-leads');
 const SELECT_KEY = 'steadyhands-selected-outreach-crm-id';
 const getSelected = () => {try{return sessionStorage.getItem(SELECT_KEY)||''}catch{return ''}};
 const setSelected = id => {try{sessionStorage.setItem(SELECT_KEY,String(id))}catch{}};
 const params = new URLSearchParams(location.search);
 if(!onLeads){
   const id = params.get('crm_id') || getSelected();
   // Preserve existing app.js deep-link behavior for selected leads.
   if(id&&!params.has('crm_id'))history.replaceState(null,'',`index.html?crm_id=${encodeURIComponent(id)}`);
   const apply = () => {
     const empty = document.getElementById('shNoLead');
     const hasCard=!!document.querySelector('#selectedLeadTop .lead-card');
     if(empty) empty.hidden=hasCard || !!id;
     document.body.classList.toggle('sh-no-selected-lead', !(hasCard || id));
   };
   if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
   return;
 }
 const target=document.getElementById('crmLeadCards');
 if(!target)return;
 const selectLead = id => {if(!id)return;setSelected(id);location.assign(`index.html?crm_id=${encodeURIComponent(id)}`)};
 // Enhance new cards as they arrive from the existing CRM query/search loader.
 const enhance=()=>{
   target.querySelectorAll('.lead-card[data-crm-id]').forEach(card=>{
     if(card.querySelector('.sh-select-outreach'))return;
     const id=card.dataset.crmId;
     const b=document.createElement('button');b.type='button';b.className='sh-select-outreach';b.textContent='Select for Outreach';
     b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();selectLead(id)});
     card.appendChild(b);
   });
 };
 const observer=new MutationObserver(enhance);
 observer.observe(target,{childList:true,subtree:true});
 enhance();
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
