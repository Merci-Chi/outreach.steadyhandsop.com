/* Use the existing CRM sitekey. This resolver never creates or replaces a site key. */
(() => {
  'use strict';
  const ORIGIN='https://steadyhandsop.com',PORTAL='https://portal.steadyhandsop.com';
  const cache=new Map(),TTL=60000;
  const keyText=v=>String(v??'').trim();
  function previewUrl(siteKey){const key=keyText(siteKey);if(!key)throw Error('This lead does not have a site key.');const u=new URL('/Previews/generic.html',ORIGIN);u.searchParams.set('sitekey',key);return u.href;}
  function portalUrl(siteKey){const key=keyText(siteKey);if(!key)throw Error('This lead does not have a site key.');const u=new URL('/index.html',PORTAL);u.searchParams.set('sitekey',key);return u.href;}
  function templateUrl(siteKey,templateKey){
    if(!keyText(templateKey))throw Error('This preview has no template.');
    return previewUrl(siteKey);
  }
  function db(){const c=window.steadyHandsCRMClient;if(!c)throw Error('Supabase is not connected.');return c;}
  async function resolveDetails(siteKey,{fresh=false}={}){
    const key=keyText(siteKey);if(!key)throw Error('This lead does not have a site key.');
    const cached=cache.get(key);if(!fresh&&cached&&Date.now()-cached.at<TTL)return cached.promise;
    const entry={at:Date.now(),promise:null};
    entry.promise=(async()=>{
      const {data,error}=await db().from('site_keys').select('site_key,template_key,active').eq('site_key',key).maybeSingle();
      if(error)throw Error('Could not verify this site key: '+error.message);
      if(!data||data.active!==true||keyText(data.site_key)!==key)throw Error('This site key is missing or inactive.');
      const url=templateUrl(data.site_key,data.template_key);
      return Object.freeze({siteKey:key,previewUrl:url,portalUrl:portalUrl(key)});
    })();
    cache.set(key,entry);
    try{return await entry.promise;}catch(e){if(cache.get(key)===entry)cache.delete(key);throw e;}
  }
  async function resolveKey(siteKey,options){return (await resolveDetails(siteKey,options)).previewUrl;}
  async function resolveLeadDetails(lead,options={fresh:true}){
    if(!lead?.sitekey)throw Error('This lead has no active site key.');
    return resolveDetails(lead.sitekey,options);
  }
  async function resolveLead(lead,options){return (await resolveLeadDetails(lead,options)).previewUrl;}
  async function ownedLead(crmId){
    if(!crmId)throw Error('Select a lead first.');
    const {data:auth,error:authError}=await db().auth.getUser();
    if(authError||!auth?.user)throw Error('Please sign in again.');
    const {data,error}=await db().from('crm').select('id,sitekey,assigned_user_id').eq('id',crmId).eq('assigned_user_id',auth.user.id).single();
    if(error||!data||data.assigned_user_id!==auth.user.id)throw Error('This lead is not assigned to you.');
    return data;
  }
  async function resolveCRMDetails(crmId){return resolveLeadDetails(await ownedLead(crmId),{fresh:true});}
  async function resolveCRM(crmId){return (await resolveCRMDetails(crmId)).previewUrl;}
  window.SteadyHandsPreviews=Object.freeze({templateUrl,portalUrl,resolveKey,resolveLead,resolveCRM,resolveLeadDetails,resolveCRMDetails});
})();
