import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../outreach-tools.js',import.meta.url),'utf8');
test('tag saving targets only the authenticated associate assigned to the selected lead',()=>{
 assert.match(source,/if\(String\(id\(\)\)!==String\(l\.id\)\)/);
 assert.match(source,/update\(\{tags:selectedTags\}\)/);
 assert.match(source,/\.eq\('assigned_user_id',auth\.user\.id\)\.select\('id,tags'\)\.single\(\)/);
});
test('the tag save path verifies persisted tags before showing success',()=>{
 assert.match(source,/select\('tags'\)\.eq\('id',l\.id\)/);
 assert.match(source,/Tags did not persist correctly/);
 assert.match(source,/Tags saved successfully/);
 assert.ok(source.indexOf('Tags saved successfully.')>source.indexOf('Tags did not persist correctly.'));
});
test('tag save errors do not claim a call disposition was saved',()=>{
 assert.match(source,/Could not save tags:/);
 assert.match(source,/Tag save failed/);
 assert.doesNotMatch(source,/Call disposition saved/);
});
