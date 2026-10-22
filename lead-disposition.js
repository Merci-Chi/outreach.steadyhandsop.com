/* Persist dispositions on the existing CRM record, visible to the admin team. */
(() => {
  'use strict';
  const normalized = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  const blocked = row => row.do_not_call === true || [row.stage, row.outcome, ...(Array.isArray(row.tags) ? row.tags : [])]
    .some(value => ['donotcall','donotcontact','dnc'].includes(normalized(value)));
  const values = row => [row.stage,row.outcome,...(Array.isArray(row.tags)?row.tags:[])].map(normalized);
  const terminal = row => values(row).some(v=>['wrongnumber','invalidnumber','disconnected','numberdisconnected','notinterested','donotcall','donotcontact','dnc'].includes(v));
  const hasContact = row => !!row.lastcalled || values(row).some(v=>['called','outreach','review','complete','callback','followup','notinterested','wrongnumber','invalidnumber','disconnected','numberdisconnected','noanswer','leftvoicemail','voicemail','busy','interested','donotcall','donotcontact','dnc','haswebsite','hasawebsite','good','bad'].includes(v));
  const hasCalled = row => !!row.lastcalled || [row.outcome,...(Array.isArray(row.tags)?row.tags:[])].map(normalized).some(v=>['called','noanswer','leftvoicemail','voicemail','busy','wrongnumber','invalidnumber','disconnected','numberdisconnected','notinterested','followup','good','bad','haswebsite','hasawebsite','interested'].includes(v));
  const retryable = row => !blocked(row) && !terminal(row) && values(row).some(v=>['noanswer','leftvoicemail','voicemail','busy'].includes(v));
  const callBlocked = row => blocked(row) || row.admin_archived===true || terminal(row) || (hasContact(row) && !retryable(row));
  const displayStage = row => {
    if(blocked(row))return 'Do not call';
    if(values(row).some(v=>['wrongnumber','invalidnumber','disconnected','numberdisconnected'].includes(v)))return 'Wrong / invalid number';
    if(values(row).includes('notinterested'))return 'Not interested';
    if(['','new','notstarted'].includes(normalized(row.stage)) && hasContact(row))return 'Called';
    return ({notstarted:'Not started',outreach:'Called',callback:'Follow-up'})[normalized(row.stage)] || row.stage || 'Not started';
  };
  async function load(id) {
    const client = window.steadyHandsCRMClient;
    if (!client || !id) throw new Error('Select a lead and sign in first.');
    const {data:auth,error:authError} = await client.auth.getUser();
    if (authError || !auth?.user) throw new Error('Please sign in again.');
    const {data,error} = await client.from('crm')
      .select('id,phone,do_not_call,stage,outcome,tags,notes,assigned_user_id,lastcalled,admin_archived').eq('id',id).single();
    if (error || !data) throw new Error('Unable to check this lead. Please refresh and try again.');
    return {client,row:data,user:auth.user};
  }
  async function ensureCallable(id, destination) {
    const {client,row,user} = await load(id);
    if (String(row.assigned_user_id)!==String(user.id)) throw new Error('This lead is not assigned to your account.');
    if (blocked(row)) throw new Error('DO NOT CALL: this lead has requested no further calls.');
    if (terminal(row) || row.admin_archived===true) throw new Error('Calling blocked: this lead is wrong/invalid, not interested, or archived.');
    const retry = retryable(row);
    const history=await client.from('callcenter_call_activity').select('outcome').eq('crm_id',String(id)).eq('user_id',user.id).limit(100);
    if(history.error) throw new Error('Unable to verify calling history. Calling is blocked until the check succeeds.');
    const previouslyCalled=hasContact(row) || (history.data||[]).some(v=>normalized(v.outcome)!=='didnotcall');
    if(previouslyCalled && !retry) throw new Error('Previously called lead. Only no-answer or voicemail leads may be retried.');
    const {data,error} = await client.rpc('outreach_call_is_blocked', {
      p_phone: destination || row.phone, p_crm_id: String(id)
    });
    if (error || typeof data !== 'boolean') throw new Error('Unable to verify Do Not Call status. Calling is blocked until the check succeeds.');
    if (data) throw new Error('DO NOT CALL: this number is suppressed or its recorded call result blocks further calls.');
    return true;
  }
  async function save(id,action,note='') {
    const {client,row,user} = await load(id);
    if (String(row.assigned_user_id) !== String(user.id)) throw new Error('This lead is not assigned to your account.');
    if (!['dnc','development'].includes(action)) throw new Error('Unknown lead action.');
    if (action === 'development' && blocked(row)) throw new Error('This lead is marked Do Not Call and cannot be sent as a warm lead.');
    if (action === 'development' && !note.trim()) throw new Error('Add a short handoff note for the development team.');
    const tags = [...new Set([...(Array.isArray(row.tags)?row.tags:[]), ...(action==='dnc'?['Do Not Call']:['Warm Lead','Development Team'])])];
    const entry = '[' + new Date().toISOString() + '] ' + (action==='dnc'?'DO NOT CALL confirmed':'Sent to Development Team as a warm lead') + ' by ' + (user.email||user.id) + (note.trim()?': '+note.trim():'');
    const patch = {...(action==='dnc'?{do_not_call:true}:{}),stage:action==='dnc'?'donotcall':'review',outcome:action==='dnc'?'Do Not Call':'Warm Lead — Development Team',tags,notes:[row.notes,entry].filter(Boolean).join('\n'),callbackdate:null,callbackat:null};
    const {data,error} = await client.from('crm').update(patch).eq('id',id).eq('assigned_user_id',user.id).select('id').single();
    if (error || !data) throw new Error(error?.message || 'The change was not saved. Refresh and try again.');
    window.dispatchEvent(new CustomEvent('steadyhands:lead-disposition',{detail:{id,action}}));
    return patch;
  }
  window.SteadyHandsLeadDisposition = {blocked,terminal,hasCalled,hasContact,retryable,callBlocked,displayStage,ensureCallable,save};
})();
