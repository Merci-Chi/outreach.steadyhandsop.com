/* Data-only helpers shared by both call workspaces. */
(() => {
  'use strict';
  function suggestions(text) {
    const t = String(text || '').toLowerCase().replace(/[’‘]/g, "'");
    if (/\b(do not call|don't call|stop calling|stop contacting|do not want you to call|don't want you to call|remove (me|us) from|take (me|us) off)\b/.test(t)) return [{id:'dnc', label:'Mark Do Not Call'}];
    const actions = [];
    if (/\b(not (?:(?:really|very|particularly|at all) )?interested|no interest|not looking|don't need|do not need)\b/.test(t)) actions.push({id:'tag:Not Interested',label:'Add Not Interested tag'});
    else if (/\b(interested|sounds good|let'?s (do it|proceed)|want to proceed)\b/.test(t)) actions.push({id:'tag:Interested',label:'Add Interested tag'});
    if (/\b(bookings?|appointments?|scheduling)\b/.test(t)) actions.push({id:'tag:Booking Needed',label:'Add Booking Needed tag'});
    if (/\b(call (me |us )?back|follow[ -]?up|tomorrow|next week)\b/.test(t)) actions.push({id:'calendar',label:'Schedule follow-up'});
    if (/\b(text me|text us|textable|send (me |us )?(a |the )?text)\b/.test(t)) actions.push({id:'phone',label:'Collect textable number'});
    if (/\b(send (me |us )?(a |the )?preview|see (a |the )?preview)\b/.test(t)) actions.push({id:'preview',label:'Open preview sharing'});
    return actions;
  }
  async function load(client,id) {
    if (!client || !id) throw Error('Select a prospect and sign in first.');
    const {data:auth,error:authError} = await client.auth.getUser();
    if (authError || !auth?.user) throw Error('Please sign in again.');
    const {data:row,error} = await client.from('crm').select('*').eq('id',id).single();
    if (error || !row) throw Error('Unable to load the prospect. Please try again.');
    if (String(row.assigned_user_id) !== String(auth.user.id)) throw Error('This prospect is not assigned to your account.');
    return {row,user:auth.user};
  }
  async function addTag(client,id,tag) {
    if (!['Interested','Not Interested','Booking Needed'].includes(tag)) throw Error('Unknown suggested tag.');
    const {row,user} = await load(client,id);
    if (window.SteadyHandsLeadDisposition?.blocked(row)) throw Error('This prospect is marked Do Not Call.');
    const tags = Array.isArray(row.tags) ? row.tags : [];
    if (tags.includes(tag)) return;
    const {data,error} = await client.from('crm').update({tags:[...tags,tag]}).eq('id',id).eq('assigned_user_id',user.id).select('id').single();
    if (error || !data) throw Error(error?.message || 'The tag was not saved.');
  }
  function transcriptSegments(row) {
    let segments=row?.segments;
    if(typeof segments==='string'){try{segments=JSON.parse(segments);}catch{segments=[];}}
    if(!Array.isArray(segments)||!segments.length)return row?.transcript?[{speaker:'unknown',text:row.transcript}]:[];
    return segments.filter(segment=>segment&&segment.final!==false&&String(segment.text||'').trim()).map(segment=>{
      const role=String(segment.speaker||'').toLowerCase();
      const speaker=['user','agent','you'].includes(role)?'agent':['prospect','customer','client','lead'].includes(role)?'prospect':'unknown';
      return {segmentId:segment.id,speaker,text:String(segment.text),seconds:Number(segment.start_seconds ?? segment.sequence)||0};
    }).sort((a,b)=>a.seconds-b.seconds);
  }
  async function fetchTranscript(client,id,since=null,callSid=null) {
    const {user}=await load(client,id);
    let query=client.from('callcenter_transcripts').select('id,crm_id,segments,transcript,started_at,created_at,transcription_status,transcription_error,interim_segments,transcript_revision').eq('user_id',user.id).eq('crm_id',id);
    if(callSid)query=query.eq('call_sid',callSid);
    else if(since)query=query.gte('started_at',since);
    const {data,error}=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error)throw Error('Saved transcript is not available: '+error.message);
    return data;
  }
  window.SteadyHandsWorkflowCore = {suggestions,load,addTag,transcriptSegments,fetchTranscript};
})();
