import test from 'node:test';
import assert from 'node:assert/strict';
import {browserDial,cellphoneDial,screen,voicemail,acceptedCell,answered,identity} from '../supabase/functions/twilio-inbound/routing.mjs';
const base='https://example.supabase.co/functions/v1/twilio-inbound';
const call={user_id:'agent-id',to_number:'+17025550101',call_sid:'CA'+'1'.repeat(32)};
test('browser leg addresses only the assigned agent and advances through its action',()=>{
 const xml=browserDial(base,call,{outreach_ring_seconds:15});
 assert(xml.includes('<Identity>'+identity('agent-id')+'</Identity>'));assert.match(xml,/stage=browser-ended/);assert.match(xml,/timeout="15"/);assert(!xml.includes('<Number'));
});
test('cellphone leg has human screening and a fallback action',()=>{
 const xml=cellphoneDial(base,call,{cellphone_number:'+17025550102',cellphone_ring_seconds:20});
 assert.match(xml,/stage=screen&amp;parent=CA/);assert.match(xml,/stage=cell-ended/);assert.match(xml,/callerId="\+17025550101"/);assert.match(xml,/>\+17025550102<\/Number>/);
});
test('screening requires one digit and hangs up if not accepted',()=>{
 const xml=screen(base,call.call_sid);assert.match(xml,/numDigits="1"/);assert.match(xml,/Press 1/);assert.match(xml,/<\/Gather><Hangup\/>/);
});
test('cellphone voicemail pickup alone does not count as successful handoff',()=>{
 assert.equal(acceptedCell('completed',{cellphone_accepted:false}),false);
 assert.equal(acceptedCell('completed',{cellphone_accepted:true}),true);
 for(const status of ['busy','failed','no-answer','canceled'])assert.equal(acceptedCell(status,{cellphone_accepted:true}),false);
});
test('successfully answered browser calls stop rather than falling through',()=>{
 assert.equal(answered('completed'),true);assert.equal(answered('no-answer'),false);
});
test('business greeting escapes markup and records with a protected callback',()=>{
 const xml=voicemail(base,'Hello <friend> & welcome');assert.match(xml,/Hello &lt;friend&gt; &amp; welcome/);assert.match(xml,/maxLength="120"/);assert.match(xml,/playBeep="true"/);assert.match(xml,/stage=recorded/);assert.match(xml,/recordingStatusCallbackEvent="completed"/);
});

const {normalizeCellphone,resolveRoutingSettings}=await import('../supabase/functions/twilio-inbound/routing.mjs');
test('personal phone normalization accepts formatted US and explicit international numbers only',()=>{
 assert.equal(normalizeCellphone('(702) 555-0102'),'+17025550102');
 assert.equal(normalizeCellphone('1-702-555-0102'),'+17025550102');
 assert.equal(normalizeCellphone('+44 20 7946 0958'),'+442079460958');
 for(const invalid of ['','anonymous','client:agent','7025550102 ext 4','00442079460958'])assert.equal(normalizeCellphone(invalid),'');
});
test('saved routing wins over profile, including an explicit disabled choice',()=>{
 assert.equal(resolveRoutingSettings(null,'(702) 555-0102').cellphone_number,'+17025550102');
 assert.equal(resolveRoutingSettings(null,'invalid'),null);
 const saved=resolveRoutingSettings({enabled:false,cellphone_number:'+17025550103'},'+17025550102');
 assert.equal(saved.enabled,false);assert.equal(saved.cellphone_number,'+17025550103');
});
