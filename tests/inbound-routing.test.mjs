import test from 'node:test';
import assert from 'node:assert/strict';
import {browserDial,voicemail,answered,identity,resolveRoutingSettings} from '../supabase/functions/twilio-inbound/routing.mjs';
const base='https://example.supabase.co/functions/v1/twilio-inbound';
const call={user_id:'agent-id',to_number:'+17025550101',call_sid:'CA'+'1'.repeat(32)};
test('browser leg rings only the assigned agent identity',()=>{
 const xml=browserDial(base,call,resolveRoutingSettings(null));
 assert(xml.includes('<Identity>'+identity('agent-id')+'</Identity>'));assert.match(xml,/stage=browser-ended/);assert.doesNotMatch(xml,/<Number/);
});
test('Twilio-only defaults need no personal number and Admin routing is not blocked by legacy disabled settings',()=>{
 const defaults=resolveRoutingSettings(null);assert.equal(defaults.enabled,true);assert.equal(defaults.cellphone_number,null);
 const saved=resolveRoutingSettings({enabled:false,cellphone_number:'+17025550102'});assert.equal(saved.enabled,true);assert.equal(saved.cellphone_number,null);
});
test('answered browser calls stop rather than falling through',()=>{assert.equal(answered('completed'),true);assert.equal(answered('no-answer'),false)});
test('business voicemail escapes markup and records through signed callbacks',()=>{
 const xml=voicemail(base,'Hello <friend> & welcome');assert.match(xml,/Hello &lt;friend&gt; &amp; welcome/);assert.match(xml,/maxLength="120"/);assert.match(xml,/stage=recorded/);assert.doesNotMatch(xml,/<Number/);
});
