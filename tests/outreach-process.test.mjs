import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async path=>readFile(new URL(path,import.meta.url),'utf8');
test('both Outreach pages expose precisely three process steps and begin at 1 / 3',async()=>{
 for(const path of ['../index.html','../call.html']){
  const html=await read(path);
  assert.equal((html.match(/data-process-page="/g)||[]).length,3);
  assert.match(html,/id="processProgress"[^>]*>1 \/ 3/);
  assert.match(html,/id="processPhone"/);
  assert.match(html,/id="processEmail"/);
  assert.match(html,/id="processTimeframe"/);
  assert.match(html,/id="processFollowup" type="date"/);
 }
});
test('completion is input driven, with no manual checkbox or legacy six-step CRM mutations',async()=>{
 const js=await read('../outreach-process.js');
 assert.match(js,/const complete=\(\)=>\[/);
 assert.match(js,/Boolean\(data\.timeframe\.trim\(\)\)&&data\.references/);
 assert.match(js,/Boolean\(data\.followup\)/);
 assert.match(js,/box\.checked=checks\[i\]/);
 assert.doesNotMatch(js,/set_outreach_process_check/);
 assert.doesNotMatch(js,/Array\(6\)/);
});
test('process drafts are scoped by signed-in associate and CRM prospect',async()=>{
 const js=await read('../outreach-process.js');
 assert.match(js,/userId&&leadId/);
 assert.match(js,/localStorage\.setItem/);
 assert.match(js,/steadyhands:call-lead-ready/);
});
