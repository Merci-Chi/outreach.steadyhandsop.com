/* Shared by Admin and Outreach Performance. No writes: preserve current ownership and stages. */
(() => {
  'use strict';
  const normalize=value=>String(value||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const isFollowup=value=>/^(follow up|followup|call back|callback)$/.test(normalize(value));
  const terminal=lead=>lead?.do_not_call===true||/^(donotcall|do not call|sold|closed|converted)$/.test(normalize(lead?.stage));
  window.steadyHandsLoadPerformanceFollowups=async ({client,userId,activities})=>{
    const all=async (table,columns,configure=q=>q,order='id')=>{
      const rows=[];
      for(let offset=0;;){
        const {data,error}=await configure(client.from(table).select(columns)).order(order,{ascending:true}).range(offset,offset+499);
        if(error)throw error;
        if(!data?.length)return rows;
        rows.push(...data);offset+=data.length;
      }
    };
    const scope=(key,extra=q=>q)=>q=>extra(userId?q.eq(key,userId):q);
    const [callbacks,pipeline,calls]=await Promise.all([
      all('crm','id,company,name,phone,timezone,callbackdate,callbackat,callback_owner_id,stage,outcome,do_not_call',scope('callback_owner_id',q=>q.eq('stage','callback'))),
      all('sh_pipeline_records','*',scope('salesperson_user_id')),
      activities||all('callcenter_call_activity','id,user_id,crm_id,outcome,created_at',scope('user_id'))
    ]);
    // Defense in depth: never render another associate's records in Outreach.
    const owned=(rows,key)=>rows.filter(r=>!userId||String(r[key])===String(userId));
    const ownPipeline=owned(pipeline,'salesperson_user_id'),ownCalls=owned(calls,'user_id');
    const key=(id,owner)=>String(id)+'\u0000'+String(owner||'');
    const stages=new Map();
    for(const row of ownPipeline){
      if(!row.crm_id)continue;
      const k=key(row.crm_id,row.salesperson_user_id),prior=stages.get(k);
      if(!prior||String(row.updated_at||row.created_at||'')>String(prior.updated_at||prior.created_at||''))stages.set(k,row);
    }
    const latest=new Map();
    for(const row of ownCalls){
      if(!row.crm_id)continue;
      const k=key(row.crm_id,row.user_id),prior=latest.get(k);
      if(!prior||String(row.created_at||'')>String(prior.created_at||'')||(row.created_at===prior.created_at&&String(row.id)>String(prior.id)))latest.set(k,row);
    }
    const pipelineLeadIds=new Set([...stages.values()].map(r=>String(r.crm_id)));
    const candidates=[...stages.values()].filter(r=>isFollowup(r.stage));
    const inferred=[...latest.values()].filter(r=>{
      if(!isFollowup(r.outcome))return false;
      const current=stages.get(key(r.crm_id,r.user_id));
      if(!current)return !pipelineLeadIds.has(String(r.crm_id));
      if(isFollowup(current.stage))return false;
      // A newer call result may reopen an older pipeline stage. A subsequent
      // pipeline update takes precedence over historical call tags.
      const changed=current.updated_at||current.created_at;
      return changed ? String(r.created_at||'')>String(changed) : normalize(current.stage)==='called';
    });
    const leads=new Map(callbacks.map(r=>[String(r.id),r]));
    const ids=[...new Set([...candidates,...inferred].map(r=>r.crm_id).filter(Boolean))];
    for(let start=0;start<ids.length;start+=100){
      const batch=ids.slice(start,start+100);
      const data=await all('crm','id,company,name,phone,timezone,callbackdate,callbackat,callback_owner_id,stage,outcome,do_not_call',q=>q.in('id',batch));
      for(const row of data)leads.set(String(row.id),row);
    }
    const result=new Map();
    const add=(lead,owner,extra={})=>{
      if(!lead||terminal(lead)||(userId&&String(owner)!==String(userId)))return;
      result.set(key(lead.id,owner),{...lead,callback_owner_id:owner,...extra});
    };
    for(const row of owned(callbacks,'callback_owner_id')){
      const current=stages.get(key(row.id,row.callback_owner_id));
      if(current?isFollowup(current.stage):!pipelineLeadIds.has(String(row.id)))add(row,row.callback_owner_id);
    }
    for(const row of candidates)add(leads.get(String(row.crm_id)),row.salesperson_user_id,{
      follow_up_at:row.follow_up_at||null,follow_up_category:row.follow_up_category||'',notes:row.notes||'',source:'pipeline'
    });
    for(const row of inferred){
      const lead=leads.get(String(row.crm_id));
      // A reassigned callback belongs to its current owner, not the historical caller.
      if(lead?.callback_owner_id&&String(lead.callback_owner_id)!==String(row.user_id))continue;
      if(!result.has(key(row.crm_id,row.user_id)))add(lead,row.user_id,{source:'call result'});
    }
    return [...result.values()].sort((a,b)=>String(a.follow_up_at||a.callbackdate||'9999').localeCompare(String(b.follow_up_at||b.callbackdate||'9999')));
  };
})();
