import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../outreach-postcall.js',import.meta.url),'utf8');
test('batch 4 exposes the requested post-call outcomes',()=>{
 for(const [value,label] of [['left_voicemail','Voicemail'],['has_website','Has a website'],['not_interested','Not interested'],['do_not_call','Do not call']]){
  assert.ok(source.includes(`['${value}'`),value+' choice missing');
  assert.ok(source.includes(`,'${label}']`),label+' text missing');
 }
});
test('DNC is highlighted and uses the existing enforced CRM workflow',()=>{
 assert.match(source,/input\[value=\\"do_not_call\\"\]/);
 assert.match(source,/SteadyHandsLeadDisposition\.save\(result\.crm_id,'dnc'/);
 assert.match(source,/if\(selected==='do_not_call'\)/);
});
test('CRM outcomes are associated with the assigned lead and checked for success',()=>{
 assert.match(source,/Has Website/);
 assert.match(source,/outcome:'Not Interested'/);
 assert.match(source,/outcome:'Left Voicemail'/);
 assert.match(source,/\.eq\('assigned_user_id',auth\.user\.id\)\.select\('id'\)\.single\(\)/);
});
test('drafts are cleared only after questionnaire and CRM writes',()=>{
 assert.ok(source.indexOf('drafts=drafts.filter')>source.indexOf("if(selected==='do_not_call')"));
 assert.match(source,/Your answers are still here/);
});
