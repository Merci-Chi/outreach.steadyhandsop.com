import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../pipeline-templates.js',import.meta.url),'utf8');
function setup(resolver){
 const nodes=new Map(),copied=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:''});return nodes.get(id);};
 const modal={querySelector:node,querySelectorAll:()=>[]};
 const window={SteadyHandsPreviews:resolver,addEventListener(){},testModal:modal};
 const source=original.replace(/\}\)\(\);\s*$/,`window.testPipeline={resolveContactPreview,selectContact,sendTemplate,mount(rows){contacts=rows;modal=window.testModal;},getPreview(){return preview;}};})();`);
 const context={window,document:{getElementById:()=>({addEventListener(){}})},navigator:{clipboard:{writeText:async text=>copied.push(text)}},location:{href:''},console:{warn(){}}};
 vm.runInNewContext(source,context);return {api:window.testPipeline,nodes,node,copied,context};
}
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('a stale saved URL never overrides the owned CRM site-key resolver',async()=>{
 let called;const s=setup({resolveCRM:async id=>(called=id,'https://steadyhandsop.com/Previews/generic.html?sitekey=existing')});
 assert.equal(await s.api.resolveContactPreview({crm_id:'owned',preview_url:'https://old.example.com'}),'https://steadyhandsop.com/Previews/generic.html?sitekey=existing');assert.equal(called,'owned');
});
test('an unauthorized CRM lookup cannot fall back to a supplied key or URL',async()=>{
 const s=setup({resolveCRM:async()=>{throw Error('not assigned');},resolveKey:async()=>{throw Error('must not be used');}});
 await assert.rejects(s.api.resolveContactPreview({crm_id:'foreign',sitekey:'other',preview_url:'https://old.example.com'}),/not assigned/);
 await assert.rejects(s.api.resolveContactPreview({preview_url:'https://old.example.com'}),/active site key/);
});
test('a slow previous contact cannot overwrite the current contact preview',async()=>{
 const a=defer(),b=defer(),s=setup({resolveCRM:id=>id==='a'?a.promise:b.promise});s.api.mount([{id:'a',crm_id:'a'},{id:'b',crm_id:'b'}]);
 s.node('#ptContact').value='a';const first=s.api.selectContact();s.node('#ptContact').value='b';const second=s.api.selectContact();
 b.resolve('https://preview.example.com/b');await second;a.resolve('https://preview.example.com/a');await first;assert.equal(s.api.getPreview(),'https://preview.example.com/b');
});
test('changing contacts during send verification does not copy or send the old contact message',async()=>{
 const pending=defer();let count=0;
 const s=setup({resolveCRM:async id=>{if(id==='b')return 'https://preview.example.com/b';return ++count===1?'https://preview.example.com/a':pending.promise;}});
 s.api.mount([{id:'a',crm_id:'a',phone:'1111111111'},{id:'b',crm_id:'b',phone:'2222222222'}]);s.node('#ptContact').value='a';await s.api.selectContact();
 const button={dataset:{copy:'0'},hasAttribute:k=>k==='data-copy',disabled:false};const sending=s.api.sendTemplate(button);
 s.node('#ptContact').value='b';await s.api.selectContact();pending.resolve('https://preview.example.com/a');await sending;assert.equal(s.copied.length,0);assert.equal(s.context.location.href,'');
});
