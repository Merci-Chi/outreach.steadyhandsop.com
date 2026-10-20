// Recent calls are recorded in callcenter_call_activity, not necessarily crm.lastcalled.
window.steadyHandsRecentCalledLeads = async function(client, userId, limit = 50) {
  if (!client || !userId) return [];
  // Call activity is scoped to the signed-in user; newest distinct CRM IDs first.
  const {data: calls, error} = await client.from('callcenter_call_activity')
    .select('crm_id,created_at')
    .eq('user_id',userId)
    .not('crm_id','is',null)
    .order('created_at',{ascending:false})
    .limit(1000);
  if (error) throw error;
  const recent = new Map();
  for (const call of calls || []) {
    const id = String(call.crm_id || '');
    if (id && !recent.has(id)) recent.set(id,call.created_at || '');
    if (recent.size >= limit) break;
  }
  if (!recent.size) return [];
  const ids = Array.from(recent.keys());
  const {data: leads, error: leadError} = await client.from('crm')
    .select('id,company,name,phone')
    .in('id',ids);
  if (leadError) throw leadError;
  const byId = new Map((leads||[]).map(row => [String(row.id),row]));
  return ids.filter(id => byId.has(id)).map(id => ({
    ...byId.get(id), lastcalled: recent.get(id)
  }));
};

/* Independent CRM lookup: handles missed call activity records and arbitrary phone/name search. */
window.steadyHandsSearchCalledLeads = async function(client,userId,term='',limit=50){
 if(!client||!userId)return [];
 const cleaned=String(term||'').trim();
 const safeTerm=cleaned.replace(/[,%()\\]/g,' ').trim();
 const digits=cleaned.replace(/\D/g,'');
 const isPhone=digits.length>=3 && /^[\d\s()+.\-]+$/.test(cleaned);
 let query=client.from('crm').select('id,company,name,phone,altphone,lastcalled,assigned_user_id');
 if(safeTerm){
   // PostgREST OR search is intentionally escaped to prevent filter injection.
   const q=safeTerm.replace(/[^\p{L}\p{N}\s+\-]/gu,' ').trim();
   if(isPhone){
     const p=digits.slice(0,15);
     query=query.or('phone.ilike.%'+p+'%,altphone.ilike.%'+p+'%');
   } else if(q){
     query=query.or('company.ilike.%'+q+'%,name.ilike.%'+q+'%,phone.ilike.%'+q+'%');
   }
 }else{
   // An explicit lastcalled timestamp is useful even when activity history is empty.
   query=query.not('lastcalled','is',null).order('lastcalled',{ascending:false});
 }
 const {data,error}=await query.limit(Math.max(50,limit));
 if(error)throw error;
 const results=data||[];
 // Search can find any accessible CRM record; avoid incorrectly assuming every record was called.
 return results.slice(0,limit);
};
window.steadyHandsFormatLeadOption = function(lead){
 const date=lead.lastcalled?new Date(lead.lastcalled):null;
 const when=date&&!Number.isNaN(date.getTime())?date.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
 return (lead.company||lead.name||lead.phone||'Unnamed lead')+(lead.phone?' · '+lead.phone:'')+(when?' · '+when:'');
};
