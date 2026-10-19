import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../twilio-voice.js', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
const controller = await readFile(new URL('../call-voice-controller.js', import.meta.url), 'utf8');
function phone(result, guard = async()=>{}) {
  const steps = [];
  const call = {on(){}};
  class Device {
    on(){}
    async connect() { steps.push('connect'); return call; }
  }
  const window = {isSecureContext:true,dispatchEvent(){},
    SteadyHandsLeadDisposition:{ensureCallable:guard},
    steadyHandsCRMClient:{functions:{invoke:async()=>{steps.push('token');return result;}},
      auth:{getSession:async()=>({data:{session:{user:{id:'agent'}}}})}}};
  vm.runInNewContext(source,{window,Device,console,CustomEvent:class {},navigator:{mediaDevices:{getUserMedia:async()=>{
    steps.push('microphone');return {getTracks:()=>[{stop(){steps.push('stop');}}]};
  }}}});
  return {window,steps};
}
test('token rejection shows backend reason and never opens microphone',async()=>{
  const page=phone({error:{message:'non-2xx response',context:new Response(JSON.stringify({error:'No enabled caller ID assigned'}),{status:403})}});
  await assert.rejects(page.window.SteadyHandsTwilioVoice.start('+17025550101',{crmId:'lead'}),/No enabled caller ID assigned/);
  assert.deepEqual(page.steps,['token']);
  assert.equal(page.window.SteadyHandsTwilioVoice.isActive(),false);
});
test('non-JSON authorization errors remain actionable',async()=>{
  const page=phone({error:{message:'non-2xx response',context:new Response('',{status:401})}});
  await assert.rejects(page.window.SteadyHandsTwilioVoice.start('+17025550101',{crmId:'lead'}),/Sign out and sign in again/);
});
test('authorized calls enable microphone and connect',async()=>{
  const page=phone({data:{token:'test-token'}});
  await page.window.SteadyHandsTwilioVoice.start('+17025550101',{crmId:'lead'});
  assert.deepEqual(page.steps,['token','microphone','stop','connect']);
});
test('Twilio failure survives subsequent error-ended notification',()=>{
  const handlers={};const output={textContent:''};
  const window={addEventListener(name,fn){handlers[name]=fn;},dispatchEvent(){}};
  vm.runInNewContext(controller,{window,CustomEvent:class{},document:{getElementById:id=>id==='refMessage'?output:null}});
  handlers['steadyhands:voice-state']({detail:{state:'error',code:31005,message:'Signaling connection failed'}});
  handlers['steadyhands:voice-state']({detail:{state:'ended',reason:'error'}});
  assert.equal(output.textContent,'Calling error 31005: Signaling connection failed');
  handlers['steadyhands:voice-state']({detail:{state:'ended',reason:'disconnect'}});
  assert.equal(output.textContent,'Call ended.');
});

test('a DNC rejection prevents token issuance, microphone access, and connection',async()=>{
 const checked=[];
 const page=phone({data:{token:'test-token'}},async(id,number)=>{checked.push([id,number]);throw Error('DO NOT CALL');});
 await assert.rejects(page.window.SteadyHandsTwilioVoice.start('(702) 555-0101',{crmId:'lead'}),/DO NOT CALL/);
 assert.deepEqual(checked,[['lead','+17025550101']]);assert.deepEqual(page.steps,[]);
 assert.equal(page.window.SteadyHandsTwilioVoice.isActive(),false);
});
