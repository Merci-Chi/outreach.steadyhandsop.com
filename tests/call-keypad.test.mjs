import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../call-keypad.js',import.meta.url),'utf8');
const phoneSource=(await readFile(new URL('../twilio-voice.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
function setup(){
 const handlers={},sent=[];
 const element=()=>({textContent:'',handlers:{},dataset:{},addEventListener(n,f){this.handlers[n]=f;},focus(){this.focused=true;}});
 const ids=Object.fromEntries(['refKeypad','callKeypad','callKeypadClose','callKeypadStatus','callKeypadDisplay'].map(id=>[id,element()]));
 const keys=[...'123456789*0#'].map(digit=>Object.assign(element(),{dataset:{digit}}));
 const dialog=ids.callKeypad;
 Object.assign(dialog,{querySelectorAll:()=>keys,showModal(){this.open=true;},close(){this.open=false;this.handlers.close();}});
 let connected=false,fail=false;
 const window={addEventListener(n,f){handlers[n]=f;},SteadyHandsTwilioVoice:{canSendDigits:()=>connected,sendDigits(d){if(fail)throw Error('Tone failed');sent.push(d);return true;}}};
 vm.runInNewContext(source,{window,document:{getElementById:id=>ids[id]}});
 return {ids,keys,handlers,sent,dialog,connect(value){connected=value;handlers['steadyhands:voice-state']();},fail(){fail=true;}};
}
test('keypad opens before a call with disabled keys and instructions',()=>{
 const p=setup();p.ids.refKeypad.handlers.click();assert.equal(p.dialog.open,true);
 assert.ok(p.keys.every(k=>k.disabled));assert.match(p.ids.callKeypadStatus.textContent,/Connect a call/);
 p.keys[0].handlers.click();assert.deepEqual(p.sent,[]);
});
test('all twelve keys send once and preserve the sent sequence',()=>{
 const p=setup();p.connect(true);p.ids.refKeypad.handlers.click();
 for(const key of p.keys)key.handlers.click();
 assert.equal(p.sent.join(''),'123456789*0#');assert.equal(p.ids.callKeypadDisplay.textContent,'123456789*0#');
 p.ids.callKeypadClose.handlers.click();assert.equal(p.dialog.open,false);assert.equal(p.ids.refKeypad.focused,true);
});
test('keyboard input sends digits but ignores repeats and modifier shortcuts',()=>{
 const p=setup();p.connect(true);p.ids.refKeypad.handlers.click();
 const key=extra=>p.dialog.handlers.keydown({key:'#',preventDefault(){},...extra});
 key({});key({repeat:true});key({ctrlKey:true});key({key:'Enter'});assert.deepEqual(p.sent,['#']);
});
test('disconnect clears digits and prevents sending; errors are visible',()=>{
 const p=setup();p.connect(true);p.keys[0].handlers.click();p.fail();p.keys[1].handlers.click();
 assert.equal(p.ids.callKeypadStatus.textContent,'Tone failed');
 p.connect(false);assert.equal(p.ids.callKeypadDisplay.textContent,'');assert.ok(p.keys.every(k=>k.disabled));
 p.keys[2].handlers.click();assert.deepEqual(p.sent,['1']);
});
test('phone sends DTMF to the connected SDK call only',async()=>{
 let state='ringing';const sent=[],events={};
 const call={status:()=>state,on(n,f){events[n]=f;},sendDigits(d){sent.push(d);}};
 class Device{on(){}async connect(){return call;}}
 const window={dispatchEvent(){},isSecureContext:true,SteadyHandsLeadDisposition:{ensureCallable:async()=>{}},steadyHandsCRMClient:{functions:{invoke:async()=>({data:{token:'test'}})},auth:{getSession:async()=>({data:{session:{user:{id:'agent'}}}})}}};
 vm.runInNewContext(phoneSource,{window,Device,console,CustomEvent:class{},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[]})}}});
 const voice=window.SteadyHandsTwilioVoice;
 assert.equal(voice.sendDigits('1'),false);
 await voice.start('+17025550101',{crmId:'test'});
 assert.equal(voice.sendDigits('1'),false);
 state='open';assert.equal(voice.canSendDigits(),true);
 for(const digit of '123456789*0#')assert.equal(voice.sendDigits(digit),true);
 assert.equal(sent.join(''),'123456789*0#');
 assert.throws(()=>voice.sendDigits('invalid'),/Invalid keypad/);
 state='reconnecting';assert.equal(voice.sendDigits('1'),false);
 state='closed';events.disconnect();assert.equal(voice.canSendDigits(),false);assert.equal(voice.sendDigits('1'),false);
});
