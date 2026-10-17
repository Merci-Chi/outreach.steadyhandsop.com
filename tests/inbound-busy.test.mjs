import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const voice=(await readFile(new URL('../twilio-voice.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
test('outbound initialization counts as busy so incoming calls cannot interrupt it',async()=>{
 let reject;
 const checking=new Promise((_resolve,no)=>{reject=no});
 const window={SteadyHandsInboundVoice:{isActive:()=>false},SteadyHandsLeadDisposition:{ensureCallable:()=>checking}};
 vm.runInNewContext(voice,{window});
 const pending=window.SteadyHandsTwilioVoice.start('+17025550101',{crmId:'lead'});
 assert.equal(window.SteadyHandsTwilioVoice.isActive(),true);
 reject(new Error('Lead check failed'));await assert.rejects(pending,/Lead check failed/);
 assert.equal(window.SteadyHandsTwilioVoice.isActive(),false);
});
test('an incoming pending/active call prevents a new outbound start',async()=>{
 const window={SteadyHandsInboundVoice:{isActive:()=>true}};
 vm.runInNewContext(voice,{window});
 await assert.rejects(window.SteadyHandsTwilioVoice.start('+17025550101'),/active or incoming/);
});
