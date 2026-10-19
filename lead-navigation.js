/* One prospect picker for Outreach and the call page. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let picking = false;
  function tell(text) {
    const status = byId('leadNavigationStatus');
    if (status) {status.textContent=text;status.hidden=!text;}
  }
  function busy() {
    return window.SteadyHandsTwilioVoice?.isActive?.() ||
      window.SteadyHandsInboundVoice?.isActive?.() ||
      window.SteadyHandsInboundVoice?.isBusyForUpdate?.() ||
      document.querySelector('#refRegularCallTracker:not([hidden])') ||
      byId('refEndCall')?.dataset.callState === 'active';
  }
  function currentId() {
    return window.steadyHandsCallLead?.id ||
      document.querySelector('#selectedLeadTop .lead-card')?.dataset.crmId ||
      new URLSearchParams(location.search).get('crm_id') ||
      sessionStorage.getItem('steadyhands-selected-outreach-crm-id') || '';
  }
  async function pick(random) {
    if (picking) return;
    if (busy()) {tell('Finish the current call before switching prospects.');return;}
    picking=true;
    const buttons=[byId('refRandomLead'),byId('refNextQueue')].filter(Boolean);
    buttons.forEach(button=>button.disabled=true);
    tell('Finding an assigned prospect…');
    try {
      const client=window.steadyHandsCRMClient;
      if (!client) throw Error('CRM connection is still loading. Please try again.');
      const disposition=window.SteadyHandsLeadDisposition;
      if (!disposition) throw Error('Lead status checks are still loading. Please try again.');
      const {data:auth,error:authError}=await client.auth.getUser();
      if (authError || !auth?.user?.id) throw Error('Please sign in again.');
      const {data,error}=await client.from('crm')
        .select('id,company,name,phone,timezone,lastcalled,stage,outcome,tags')
        .eq('assigned_user_id',auth.user.id)
        .order('id',{ascending:true})
        .limit(1000);
      if (error) throw error;
      const eligible=(data||[]).filter(row=>row.id && !disposition.blocked(row));
      if (!eligible.length) {tell('No assigned prospects found. Check My Leads.');return;}
      const current=String(currentId());
      const others=eligible.filter(row=>String(row.id)!==current);
      const pool=others.length ? others : eligible;
      const choice=random ? pool[Math.floor(Math.random()*pool.length)] :
        eligible[(eligible.findIndex(row=>String(row.id)===current)+1)%eligible.length];
      // A call may arrive while the CRM lookup is in progress.
      if (busy()) {tell('Finish the current call before switching prospects.');return;}
      sessionStorage.setItem('steadyhands-selected-outreach-crm-id',String(choice.id));
      if (location.pathname.endsWith('/call.html')) {
        const handoff={id:String(choice.id),company:choice.company||choice.name||'',
          number:choice.phone||'',contact:choice.name||'',timezone:choice.timezone||''};
        sessionStorage.setItem('steadyhands-outreach-call-handoff',JSON.stringify(handoff));
        const params=new URLSearchParams({crm_id:handoff.id,company:handoff.company,
          number:handoff.number,contact:handoff.contact,timezone:handoff.timezone});
        window.location.assign('call.html?'+params.toString());
      } else {
        window.location.assign('index.html?crm_id='+encodeURIComponent(choice.id));
      }
    } catch (error) {
      console.error('Unable to select assigned prospect',error);
      tell('Unable to select prospect: '+(error?.message||'Please try again.'));
    } finally {
      picking=false;
      buttons.forEach(button=>button.disabled=false);
    }
  }
  function init() {
    byId('refRandomLead')?.addEventListener('click',()=>pick(true));
    byId('refNextQueue')?.addEventListener('click',()=>pick(false));
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
