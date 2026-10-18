import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bundle=await readFile(new URL('../vendor/twilio-voice-sdk-2.18.5.min.js',import.meta.url),'utf8');
function context(){
 const context={console:{warn(){},info(){},debug(){},error(){}},setTimeout,clearTimeout,setInterval,clearInterval,
  window:{addEventListener(){},removeEventListener(){},location:{protocol:'https:',host:'test.example'}},
  navigator:{userAgent:'SDK regression test'},
  document:{createElement(){return {canPlayType(){return ''},setAttribute(){},addEventListener(){},removeEventListener(){},load(){},pause(){}}}}};
 context.window.navigator=context.navigator;vm.createContext(context);vm.runInContext(bundle,context);return context;
}
test('official browser SDK initializes the real Device without the levels.ERROR crash',()=>{
 const c=context();assert.equal(c.Twilio.Logger.levels.ERROR,4);
 const device=new c.Twilio.Device('test-token',{logLevel:'warn',closeProtection:true,enableImprovedSignalingErrorPrecision:true,maxCallSignalingTimeoutMs:30000});
 assert.equal(device.state,'unregistered');assert.equal(c.Twilio.Logger.getLevel(),3);device.destroy();assert.equal(device.state,'destroyed');
});
test('both calling paths import one shared local SDK rather than runtime ESM conversions',async()=>{
 for(const path of ['twilio-voice.js','inbound-calling.js']){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');assert.match(source,/from ['"]\.\/twilio-sdk\.js\?v=2\.18\.5-browser['"]/);assert.doesNotMatch(source,/esm\.sh/);
 }
 const loader=await readFile(new URL('../twilio-sdk.js',import.meta.url),'utf8');assert.match(loader,/import '\.\/vendor\/twilio-voice-sdk-2\.18\.5\.min\.js'/);
});
test('vendored SDK matches the official package distribution exactly',()=>{
 assert.equal(createHash('sha256').update(bundle).digest('hex'),'35d3cb1b22e309f9884724a89250aecd2de4f1556ad7b67a7bc5e06c73dcb74a');
});
