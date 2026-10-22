/* Shared fresh-lead navigation. Never infer uncalled status from CRM.lastcalled alone. */
(() => {
'use strict';
const byId=id=>document.getElementById(id);
let picking=false;
const normalized=v=>String(v||'').toLowerCase().replace(/[^a-z]/g,'');
const blocked=row=>row.admin_archived===true||row.do_not_call===true||[row.stage,row.outcome,...(Array.isArray(row.tags)?row.tags:[])].some(v=>['donotcall','donotcontact','dnc','notinterested','wrongnumber','invalidnumber','disconnected','numberdisconnected','complete','completed','sold'].includes(normalized(v)));
const retryable=row=>['noanswer','leftvoicemail','voicemail','busy'].includes(normalized(row.outcome))||(Array.isArray(row.tags)&&row.tags.some(v=>['noanswer','leftvoicemail','voicemail'].includes(normalized(v))));
const selected=()=>window.steadyHandsCallLead?.id||document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId||new URLSearchParams(location.search).get('crm_id')||'';
function tell(text){const el=byId('leadNavigationStatus');if(el){el.textContent=text;el.hidden=!text}}
function busy(){return window.SteadyHandsTwilioVoice?.isActive?.()||window.SteadyHandsInboundVoice?.isActive?.()||window.SteadyHandsInboundVoice?.isBusyForUpdate?.()||document.querySelector('#refRegularCallTracker:not([hidden])')||byId('refEndCall')?.dataset.callState==='active'}
async function candidates(client,userId){
 const [leads,calls]=await Promise.all([
  client.from('crm').select('id,company,name,phone,timezone,lastcalled,stage,outcome,tags,do_not_call,admin_archived,call_status').eq('assigned_user_id',userId).order('id',{ascending:true}).limit(5000),
  client.from('callcenter_call_activity').select('crm_id,outcome').eq('user_id',userId).not('crm_id','is',null).order('created_at',{ascending:false}).limit(5000)
 ]);
 if(leads.error)throw leads.error;if(calls.error)throw calls.error;
 // A call may have been made by a different associate. The database lastcalled
 // timestamp also excludes those records even when this user's history is empty.
 const called=new Set((calls.data||[]).filter(r=>normalized(r.outcome)!=='didnotcall').map(r=>String(r.crm_id)));
 const valid=(leads.data||[]).filter(r=>r.id&&r.phone&&!blocked(r)&&!window.SteadyHandsLeadDisposition?.blocked?.(r));
 const contacted=r=>Boolean(r.lastcalled||called.has(String(r.id))||r.call_status==='Called'||window.SteadyHandsLeadDisposition?.hasContact?.(r)||retryable(r));
 return {fresh:valid.filter(r=>!contacted(r)),
  followups:valid.filter(contacted)};
}
function navigate(row,retry){
 sessionStorage.setItem('steadyhands-selected-outreach-crm-id',String(row.id));
 const params=new URLSearchParams({crm_id:String(row.id)});
 if(retry)params.set('follow_up','1');
 if(location.pathname.endsWith('/call.html')){const handoff={id:String(row.id),company:row.company||row.name||'',number:row.phone||'',contact:row.name||'',timezone:row.timezone||''};sessionStorage.setItem('steadyhands-outreach-call-handoff',JSON.stringify(handoff));for(const [key,value] of Object.entries(handoff))if(key!=='id')params.set(key,value);window.location.assign('call.html?'+params.toString());}else window.location.assign('index.html?'+params.toString());
}
async function pick(mode){
 if(picking)return;if(busy()){tell('Finish the current call before switching prospects.');return}
 picking=true;
 const buttons=[byId('refPreviouslyCalled'),byId('refRandomLead'),byId('refNextQueue')].filter(Boolean);
 buttons.forEach(b=>b.disabled=true);
 tell(mode==='retry'?'Finding assigned follow-up leads…':'Finding never-called assigned leads…');
 try{
  const client=window.steadyHandsCRMClient;if(!client)throw Error('CRM connection unavailable.');
  const {data,error}=await client.auth.getUser();if(error||!data?.user?.id)throw Error('Please sign in again.');
  const {fresh,followups}=await candidates(client,data.user.id);
  const list=mode==='retry'?followups:fresh;
  if(!list.length){tell(mode==='retry'?'No eligible follow-up leads assigned to you.':'No new uncalled assigned prospects are available.');return}
  const current=String(selected());
  const other=list.filter(r=>String(r.id)!==current);
  const pool=other.length?other:list;
  const row=mode==='random'||mode==='retry'?pool[Math.floor(Math.random()*pool.length)]:pool[0];
  if(busy()){tell('Finish the current call before switching prospects.');return}
  navigate(row,mode==='retry');
 }catch(err){console.error('Lead selection failed',err);tell('Unable to select prospect: '+(err?.message||err))}
 finally{picking=false;buttons.forEach(b=>b.disabled=false)}
}
window.SteadyHandsLeadNavigation={next:()=>pick('next')};
function init(){
 byId('refPreviouslyCalled')?.addEventListener('click',()=>pick('retry'));
 byId('refRandomLead')?.addEventListener('click',()=>pick('random'));
 byId('refNextQueue')?.addEventListener('click',()=>pick('next'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
