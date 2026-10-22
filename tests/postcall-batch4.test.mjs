import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../outreach-postcall.js',import.meta.url),'utf8');
test('batch 4 exposes the requested post-call outcomes',()=>{
 for(const [value,label] of [['left_voicemail','Voicemail'],['has_website','Has a website'],['gatekeeper','Gatekeeper'],['not_interested','Not interested'],['do_not_call','Do not call']]){
  assert.ok(source.includes(`['${value}'`),value+' choice missing');
  assert.ok(source.includes(`,'${label}']`),label+' text missing');
 }
});
test('DNC is highlighted and uses the existing enforced CRM workflow',()=>{
 assert.ok(source.includes('background:#fff1f2'));
 assert.match(source,/SteadyHandsLeadDisposition\.save\(result\.crm_id,'dnc'/);
 assert.match(source,/if\(selected==='do_not_call'\)/);
});
test('CRM outcomes are associated with the assigned lead and checked for success',()=>{
 assert.match(source,/Has Website/);
 assert.match(source,/outcome:'Not Interested'/);
 assert.match(source,/contactOutcome=isVoicemail\?'Left Voicemail':'No Answer'/);
 assert.match(source,/outcome:contactOutcome,stage:'outreach'/);
 assert.match(source,/\.eq\('assigned_user_id',auth\.user\.id\)\.select\('id'\)\.single\(\)/);
});
test('drafts are cleared only after questionnaire and CRM writes',()=>{
 assert.ok(source.indexOf('drafts=drafts.filter')>source.indexOf("if(selected==='do_not_call')"));
 assert.match(source,/Your answers are still here/);
});

test('Gatekeeper outcome is retained as a nonterminal call and durable assigned CRM tag',()=>{
 assert.match(source,/gatekeeper:'called'/);
 assert.match(source,/if\(selected==='gatekeeper'\)/);
 assert.match(source,/tag\.trim\(\)\.toLowerCase\(\)==='gatekeeper'/);
 assert.match(source,/\.update\(\{tags:\[\.\.\.tags,'Gatekeeper'\]\}\)\.eq\('id',result\.crm_id\)\.eq\('assigned_user_id',auth\.user\.id\)/);
 assert(source.indexOf("if(selected==='gatekeeper')")<source.indexOf('drafts=drafts.filter'));
});
