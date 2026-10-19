import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../action-needed.js',import.meta.url),'utf8');
test('legacy Action Needed explains the onboarding handoff without embedding a questionnaire',()=>{
 const main={innerHTML:''};let init;
 vm.runInNewContext(source,{document:{getElementById:()=>main,addEventListener:(_,fn)=>init=fn}});init();
 assert.match(main.innerHTML,/https:\/\/onboard.steadyhandsop.com/);assert.match(main.innerHTML,/automatically/);assert.doesNotMatch(source,/OutreachQuestionnaire\.open|Recheck access/);
});
