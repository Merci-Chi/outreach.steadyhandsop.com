import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../lead-timezone.js', import.meta.url), 'utf8') + '\n' + await readFile(new URL('../app.js', import.meta.url), 'utf8');
function setup({rows = [], selectedId = '', exact = null, error = null, historyPromise = null, previewPromise = null} = {}) {
  const queries = [], status = {textContent:'Connecting',style:{}}, message = {textContent:''};
  let skeleton = true, cards = [];
  const box = {set innerHTML(value) {}, replaceChildren(...value) {cards=value;}};
  const nodes = {'#crmStatus':status,'#crmLeadCards':box,'#refMessage':message,
    'main.content':{classList:{remove(){}}}};
  const client = {auth:{getSession:async()=>({data:{session:{user:{id:'agent'}}}})},from(table) {
    const filters=[]; const entry={table,filters}; queries.push(entry);
    const result = () => table === 'team_permissions' ? {data:{role:'SALES',active:true}} :
      table === 'crm' ? {data:(filters.some(([k])=>k==='id') ? [exact || rows.find(row=>String(row.id)===String(filters.find(([k])=>k==='id')[1]))].filter(Boolean) : rows).slice(0,entry.limit),error} : {data:[]};
    const query = {select(){return query},eq(k,v){filters.push([k,v]);return query},not(){return query},
      limit(size){entry.limit=size;return table==='callcenter_call_activity' && historyPromise ? historyPromise : Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())}};
    return query;
  }};
  const window = {supabase:{},steadyHandsCRMClient:client,__previewPromise:previewPromise};
  const context = vm.createContext({window,document:{addEventListener(){},querySelector(selector){
    if(selector==='#selectedLeadTop .skeleton-lead') return skeleton?{remove(){skeleton=false}}:null;
    if(selector==='#selectedLeadTop .lead-card') return cards[0]||null;
    return nodes[selector]||null;
  }},location:{search:selectedId?'?crm_id='+selectedId:''},sessionStorage:{getItem(){return ''}},
    URLSearchParams,URL,Intl,console:{warn(){},error(){}},setTimeout,clearTimeout});
  vm.runInContext(source,context);
  vm.runInContext(`showSelectedLeadSkeleton=()=>{}; crmSetupGlobalSearchControls=()=>{};
    loadLiveCRMTotals=async()=>{}; crmFetchSiteKeyPreviewURLs=async()=>window.__previewPromise || new Map();
    makeCRMLinkCard=lead=>({id:lead.id,isConnected:true,dataset:{},links:{innerHTML:''},querySelector(){return this.links},localTime:callcenterLocalTimeText(lead.phone,lead.timezone)});
    setupCopyButtons=setupOutreach=callcenterStartAvailabilitySync=startLeadCallTimeTicker=refreshIcons=()=>{};`,context);
  return {context,queries,status,message,cards:()=>cards,skeleton:()=>skeleton,
    load:()=>vm.runInContext('loadApprovedPreviewCRM()',context)};
}
test('one malformed timezone cannot prevent the assigned queue from rendering',async()=>{
  const s=setup({rows:[{id:'bad',timezone:'America/Invalid'},{id:'good',timezone:'America/Los_Angeles'}]});
  await s.load();assert.equal(s.cards().length,1);assert.equal(s.skeleton(),false);
  assert.equal(vm.runInContext("callcenterLeadZone('7025550101','America/Invalid').zone",s.context),'America/Los_Angeles');
});
test('valid CRM zones remain authoritative',()=>{
  const s=setup();assert.equal(vm.runInContext("callcenterLeadZone('7025550101','Europe/London').zone",s.context),'Europe/London');
});
test('numeric CRM IDs match a My Leads URL without an extra query',async()=>{
  const s=setup({rows:[{id:42}],selectedId:'42'});await s.load();
  assert.equal(s.cards()[0].id,42);assert.equal(s.queries.filter(q=>q.table==='crm').length,1);
});
test('a selected lead outside the initial batch is fetched with its assignment restriction',async()=>{
  const s=setup({rows:[{id:'first'}],selectedId:'later',exact:{id:'later'}});await s.load();
  assert.equal(s.cards()[0].id,'later');
  assert.equal(s.queries.filter(q=>q.table==='crm').length,1);
  assert.equal(s.queries.find(q=>q.table==='crm').limit,1);
  assert.deepEqual(s.queries.filter(q=>q.table==='crm')[0].filters,[['assigned_user_id','agent'],['id','later']]);
});
test('an inaccessible deep link cannot silently show another prospect or leave a loading skeleton',async()=>{
  const s=setup({rows:[{id:'other'}],selectedId:'foreign'});await s.load();
  assert.equal(s.cards().length,0);assert.equal(s.skeleton(),false);
  assert.match(s.message.textContent,/no longer assigned/);
});
test('CRM errors end loading and are displayed in the prospect panel',async()=>{
  const s=setup({error:{message:'Connection failed'}});await s.load();
  assert.equal(s.skeleton(),false);assert.match(s.message.textContent,/Connection failed/);
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('slow call history and previews cannot delay selected contact details', {timeout:1000}, async()=>{
  const history=deferred(),preview=deferred();
  const s=setup({selectedId:'chosen',exact:{id:'chosen',sitekey:'key'},historyPromise:history.promise,previewPromise:preview.promise});
  await s.load();
  assert.equal(s.cards()[0].id,'chosen');assert.equal(s.skeleton(),false);
  assert.equal(s.cards()[0].dataset.previewUrl,undefined);
  preview.resolve(new Map([['key','https://steadyhandsop.com/Previews/generic.html?sitekey=key']]));
  history.resolve({data:[{crm_id:'chosen'}]});
  await new Promise(r=>setImmediate(r));
  assert.match(s.cards()[0].dataset.previewUrl,/sitekey=key/);
  assert.match(s.cards()[0].links.innerHTML,/Open Website Preview/);
  assert.equal(vm.runInContext("window.steadyHandsCalledCRMIds.has('chosen')",s.context),true);
});
test('a delayed preview cannot mutate a disconnected prospect card',async()=>{
  const preview=deferred();const s=setup({rows:[{id:'old',sitekey:'old-key'}],previewPromise:preview.promise});
  await s.load();s.cards()[0].isConnected=false;
  preview.resolve(new Map([['old-key','https://steadyhandsop.com/Previews/generic.html?sitekey=old-key']]));
  await new Promise(r=>setImmediate(r));assert.equal(s.cards()[0].dataset.previewUrl,undefined);
});
