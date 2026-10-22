/* Three-step preview Process. Completion follows validated input; no legacy manual checklist writes. */
(()=>{
 'use strict';
 const panel=document.querySelector('.outreach-process');if(!panel)return;
 const $=id=>panel.querySelector('#'+id);
 const steps=[...panel.querySelectorAll('[data-process-page]')];
 let current=1,leadId='',userId='',data=blank(),epoch=0;
 function blank(){return {phone:'',email:'',sameNumber:false,timeframe:'',references:false,followup:'',notes:''};}
 const selectedId=()=>window.steadyHandsCallLead?.id||document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId||'';
 const client=()=>window.steadyHandsCRMClient;
 const key=()=>userId&&leadId?'steadyhands-preview-process-v1:'+userId+':'+leadId:null;
 const validPhone=v=>{const n=String(v||'').replace(/\D/g,'');return n.length>=10&&n.length<=15;};
 const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
 const complete=()=>[
   (data.sameNumber && validPhone(window.steadyHandsCallLead?.number||window.steadyHandsCallLead?.phone||''))
     ||validPhone(data.phone)||validEmail(data.email),
   Boolean(data.timeframe.trim())&&data.references,
   Boolean(data.followup)
 ];
 function save(){
   const k=key();if(!k)return;
   try{localStorage.setItem(k,JSON.stringify(data));}catch{$('processFeedback').textContent='This browser could not save the draft.';}
 }
 function render(){
   const checks=complete();
   steps.forEach((step,i)=>{step.hidden=i+1!==current;const box=$('processCheck'+(i+1));box.checked=checks[i];});
   $('processProgress').textContent=current+' / 3';
   $('processPrevious').disabled=current===1;
   $('processNext').disabled=current===3;
   $('processNext').textContent=current===3?'Finished':'Next step →';
 }
 function fill(){
   for(const name of ['phone','email','timeframe','followup','notes'])$('process'+name[0].toUpperCase()+name.slice(1)).value=data[name];
   $('processSameNumber').checked=data.sameNumber;
   $('processReferences').checked=data.references;
   render();
 }
 function capture(){
   for(const name of ['phone','email','timeframe','followup','notes'])data[name]=$('process'+name[0].toUpperCase()+name.slice(1)).value;
   data.sameNumber=$('processSameNumber').checked;data.references=$('processReferences').checked;
   save();render();$('processFeedback').textContent='';
 }
 for(const element of panel.querySelectorAll('input:not([disabled]),textarea')){element.addEventListener('input',capture);element.addEventListener('change',capture);}
 $('processPrevious').addEventListener('click',()=>{current=Math.max(1,current-1);render();});
 $('processNext').addEventListener('click',()=>{current=Math.min(3,current+1);render();});
 async function load(){
   const id=selectedId();if(id===leadId)return;
   const version=++epoch;leadId=id;current=1;data=blank();
   try{
     const session=await client()?.auth?.getSession?.();
     if(version!==epoch)return;
     userId=session?.data?.session?.user?.id||'';
     const k=key();
     if(k){const stored=JSON.parse(localStorage.getItem(k)||'{}');for(const name of Object.keys(data))if(typeof stored[name]===typeof data[name])data[name]=stored[name];}
   }catch{}
   if(version===epoch)fill();
 }
 window.addEventListener('steadyhands:call-lead-ready',load);
 const selected=document.querySelector('#selectedLeadTop');
 if(selected)new MutationObserver(()=>{if(selectedId()!==leadId)void load();}).observe(selected,{childList:true,subtree:true,attributes:true,attributeFilter:['data-crm-id']});
 // Keep the last known lead draft separate from other associates and CRM records.
 void load();fill();
 const style=document.createElement('style');style.textContent=
 '.outreach-process .process-nav{display:flex;align-items:center;gap:8px;margin-left:auto}.outreach-process header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.outreach-process .process-nav button{padding:9px 14px;border:1px solid #d5e1ef;border-radius:12px;background:#fff;color:#19558d;font-weight:700;cursor:pointer}.outreach-process #processNext{background:#0877f9;color:#fff;border-color:#0877f9}.outreach-process .process-nav button:disabled{opacity:.4;cursor:default}.outreach-process #processProgress{padding:8px 14px;border-radius:24px;background:#e5f3ff;color:#0970d9;font-weight:800;white-space:nowrap}.outreach-process #processSteps li[hidden]{display:none!important}.outreach-process #processSteps ol{list-style:none;margin:0;padding:0}.outreach-process #processSteps li{padding:16px 0}.outreach-process .process-step{display:flex;align-items:center;gap:12px}.outreach-process .process-step input{width:19px;height:19px;accent-color:#0877f9}.outreach-process .process-contact-fields{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:end;margin-top:18px}.outreach-process .process-contact-fields label,.outreach-process .process-field{display:flex;flex-direction:column;gap:7px;color:#334f70;font-weight:600}.outreach-process .process-contact-fields input,.outreach-process .process-field input,.outreach-process .process-field textarea{box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid #cbd8e5;background:white;color:#163456}.outreach-process .process-same-number{display:flex;gap:8px;align-items:center;margin:14px 0;color:#334f70}.outreach-process blockquote{margin:14px 0;padding:14px;border-radius:10px;background:#f1f6fc;color:#456184}.outreach-process .process-field{margin-top:15px}@media(max-width:650px){.outreach-process .process-contact-fields{grid-template-columns:1fr}.outreach-process .process-contact-fields>span{text-align:center}}';
 document.head.append(style);
})();
