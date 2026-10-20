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
