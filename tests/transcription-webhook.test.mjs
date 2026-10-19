import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
const source=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/twilio-transcription-webhook/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,''));
const call='CA'+'1'.repeat(32),sid='GT'+'2'.repeat(32),base='https://example.supabase.co/functions/v1/twilio-transcription-webhook';
function setup(){
 let handler,access=0;const writes=[],checks=[];
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',TWILIO_AUTH_TOKEN:'token',TWILIO_ACCOUNT_SID:'account'};
 const db={rpc:async(name,args)=>{writes.push({name,args});return {error:env.FAIL?{message:'database unavailable'}:null}}};
 vm.runInNewContext(source,{URLSearchParams,Response,Date,console:{error(){}},createClient(){access++;return db},twilio:{validateRequest(token,signature,url,form){checks.push({url,form});return signature==='valid'}},Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn}}});
 const request=(form={},signature='valid',type='application/x-www-form-urlencoded')=>handler(new Request(base,{method:'POST',headers:{'Content-Type':type,'X-Twilio-Signature':signature},body:new URLSearchParams({CallSid:call,TranscriptionSid:sid,AccountSid:'account',TranscriptionEvent:'transcription-content',Final:'true',SequenceId:'2',Timestamp:'2026-10-19T00:00:02Z',Track:'outbound_track',TranscriptionData:JSON.stringify({transcript:'Sounds good'}),...form})}));
 return {request,writes,checks,env,access:()=>access};
}
test('only correctly signed callbacks from the configured account reach persistence',async()=>{
 const s=setup();assert.equal((await s.request({},'invalid')).status,403);assert.equal((await s.request({AccountSid:'other'})).status,403);assert.equal(s.access(),0);
 s.env.TWILIO_TRANSCRIPTION_CALLBACK_URL='https://hooks.example.com/transcripts';await s.request();assert.equal(s.checks.at(-1).url,s.env.TWILIO_TRANSCRIPTION_CALLBACK_URL);
});
test('final utterances carry stable IDs and correct parent-leg speakers, ignoring supplied labels',async()=>{
 const s=setup();assert.equal((await s.request({Track:'inbound_track',InboundTrackLabel:'customer'})).status,204);
 const p=s.writes[0].args;assert.equal(p.p_call_sid,call);assert.equal(p.p_segment.speaker,'agent');assert.equal(p.p_segment.id,sid+':2');
 await s.request();assert.equal(s.writes[1].args.p_segment.speaker,'customer');
});
test('partial callbacks are marked provisional while empty and unknown events are ignored',async()=>{
 const s=setup();for(const f of [{Final:'false'},{TranscriptionData:'{"transcript":" "}'},{TranscriptionEvent:'unhandled'}])assert.equal((await s.request(f)).status,204);
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].args.p_segment.final,false);
});
test('malformed data, sequence and identifiers fail without writing',async()=>{
 const s=setup();for(const f of [{TranscriptionData:'{'},{SequenceId:'bad'},{CallSid:'bad'},{TranscriptionSid:'bad'}])assert.equal((await s.request(f)).status,400);
 assert.equal(s.writes.length,0);assert.equal((await s.request({},'valid','application/json')).status,415);
});
test('lifecycle events persist errors and stopped state; database errors return retryable failure',async()=>{
 const s=setup();await s.request({TranscriptionEvent:'transcription-error',TranscriptionError:'Provider unavailable'});
 assert.equal(s.writes[0].args.p_error,'Provider unavailable');assert.equal(s.writes[0].args.p_segment,null);
 await s.request({TranscriptionEvent:'transcription-stopped'});assert.equal(s.writes[1].args.p_event,'transcription-stopped');
 s.env.FAIL=true;assert.equal((await s.request()).status,500);
});
