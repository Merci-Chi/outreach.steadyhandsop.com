/* Fresh admin-managed assignments; SMS verification is a separate feature. */
(() => {
  'use strict';
  const refreshes = new WeakMap();
  let pending = null, pendingClient = null;
  const failure = (message,extra={}) => Object.assign(new Error(message),extra);
  const authError = error => Number(error?.status)===401 || ['PGRST301','PGRST303','bad_jwt','jwt_expired'].includes(error?.code);
  const transient = error => authError(error) || [0,408,429].includes(Number(error?.status)) || Number(error?.status)>=500 || /failed to fetch|network|timeout|temporar/i.test(error?.message||'');
  const read = (result,message) => {
    if(result.error)throw failure(message,{recoverable:transient(result.error),refresh:authError(result.error)});
    return result.data;
  };
  async function session(client,expected='') {
    const result=await client.auth.getSession();
    const current=read(result,'Unable to read your calling session. Check your connection and try again.')?.session;
    if(!current?.user?.id)throw failure('Your calling session has ended. Sign in again before calling.');
    if(expected&&current.user.id!==expected)throw failure('The signed-in account changed. Retry the call from the current account.');
    if(window.steadyHandsCRMClient!==client)throw failure('Your calling connection changed. Retry the call.');
    return current;
  }
  async function refresh(client,expected='') {
    if(refreshes.has(client)) {
      await refreshes.get(client);
      return session(client,expected);
    }
    const work=(async()=>{
      const current=await session(client,expected);
      const result=await client.auth.refreshSession();
      if(result.error)throw failure('Unable to refresh your calling session. Check your connection, then retry or sign in again.');
      const updated=result.data?.session;
      if(!updated?.user?.id)throw failure('Your calling session has ended. Sign in again before calling.');
      if(updated.user.id!==current.user.id)throw failure('The signed-in account changed. Retry the call from the current account.');
      return session(client,current.user.id);
    })();
    refreshes.set(client,work);
    try{return await work;}finally{if(refreshes.get(client)===work)refreshes.delete(client);}
  }
  window.SteadyHandsCallingSession={refresh};
  async function lookup(client) {
    let expected='',missingAssignment=false;
    for(let attempt=0;attempt<2;attempt++) {
      try {
        let current=await session(client,expected);
        expected=current.user.id;
        if(current.expires_at&&current.expires_at*1000<=Date.now()+60000)current=await refresh(client,expected);
        const auth=read(await client.auth.getUser(),'Unable to verify your calling session. Check your connection and retry.');
        if(!auth?.user?.id)throw failure('Your calling session has ended. Sign in again before calling.');
        if(auth.user.id!==expected)throw failure('The signed-in account changed. Retry the call from the current account.');
        const assignment=read(await client.from('callcenter_phone_assignments').select('phone_number_id').eq('user_id',expected).maybeSingle(),
          'Unable to check your phone assignment. Check your connection and retry.');
        if(!assignment?.phone_number_id) {
          // An empty read during session refresh or reassignment is not yet a
          // confirmed missing assignment. Re-authenticate and re-read once.
          if(!attempt){missingAssignment=true;await refresh(client,expected);continue;}
          if(!missingAssignment)throw failure('Unable to confirm your phone assignment after a connection problem. Retry the call.');
          await session(client,expected);return null;
        }
        const number=read(await client.from('callcenter_phone_numbers').select('id,phone_number,active,twilio_status').eq('id',assignment.phone_number_id).maybeSingle(),
          'Unable to check your phone approval. Check your connection and retry.');
        if(!number) {
          if(!attempt){await refresh(client,expected);continue;}
          throw failure('Your assigned calling number could not be loaded. Retry, then ask your administrator to check the assignment.');
        }
        await session(client,expected);
        if(number.active!==true)throw failure('Your assigned calling number is disabled. Ask your administrator to enable it.');
        if(number.twilio_status!=='ready')throw failure('Your assigned calling number is not Twilio Ready. Ask your administrator to check it.');
        if(!/^\+[1-9]\d{7,14}$/.test(String(number.phone_number||'')))throw failure('Your assigned calling number has an invalid phone number. Ask your administrator to correct it.');
        return number;
      } catch(error) {
        if(attempt||!(error.recoverable||transient(error)))throw error;
        if(error.refresh||authError(error))await refresh(client,expected);
        else await new Promise(resolve=>setTimeout(resolve,200));
      }
    }
  }
  window.SteadyHandsApprovedCaller = () => {
    const client=window.steadyHandsCRMClient;
    if(!client)return Promise.reject(failure('CRM connection is not ready. Please try again.'));
    if(pending&&pendingClient===client)return pending;
    pendingClient=client;
    const work=lookup(client);
    pending=work;
    return work.finally(()=>{if(pending===work){pending=null;pendingClient=null;}});
  };
})();
