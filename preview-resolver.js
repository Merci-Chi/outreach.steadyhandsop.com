/* Site keys are verified against Supabase. The generic entrypoint renders the matching category source-template when available. */
(() => {
  'use strict';
  const ORIGIN='https://steadyhandsop.com';
  const cache=new Map();
  const keyText=v=>String(v??'').trim();
  function templateUrl(siteKey,templateKey){
    const key=keyText(siteKey);
    const slug=keyText(templateKey).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if(!key||!slug)throw Error('This preview has no valid site key or template.');
    return `${ORIGIN}/Previews/generic.html?sitekey=${encodeURIComponent(key)}`;
  }
  function db(){const c=window.steadyHandsCRMClient;if(!c)throw Error('Supabase is not connected.');return c;}
  async function resolveKey(siteKey){
    const key=keyText(siteKey);if(!key)throw Error('This lead does not have a site key.');
    if(cache.has(key))return cache.get(key);
    const pending=(async()=>{
      const {data,error}=await db().from('site_keys').select('site_key,template_key,active').eq('site_key',key).maybeSingle();
      if(error)throw Error('Could not verify this site key: '+error.message);
      if(!data||data.active!==true)throw Error('This site key is missing or inactive.');
      return templateUrl(data.site_key,data.template_key);
    })();
    cache.set(key,pending);
    try{return await pending;}catch(e){cache.delete(key);throw e;}
  }
  async function resolveLead(lead){
    if(!lead?.sitekey)throw Error('This lead has no active site key.');
    return resolveKey(lead.sitekey);
  }
  async function resolveCRM(crmId){
    if(!crmId)throw Error('Select a lead first.');
    const {data,error}=await db().from('crm').select('id,sitekey,assigned_user_id').eq('id',crmId).single();
    if(error)throw Error('Could not load the lead: '+error.message);
    const {data:auth}=await db().auth.getUser();
    if(!auth?.user||data.assigned_user_id!==auth.user.id)throw Error('This lead is not assigned to you.');
    return resolveLead(data);
  }
  // Checking /Previews/ from a different subdomain may be blocked by CORS;
  // a valid key and template mapping is NOT proof that the page renders the business data.
  window.SteadyHandsPreviews=Object.freeze({templateUrl,resolveKey,resolveLead,resolveCRM});
})();
