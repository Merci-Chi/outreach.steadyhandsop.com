import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
const user='11111111-2222-3333-4444-555555555555',other='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const sources={};for(const name of ['twilio-voice-token','twilio-voice-outbound'])sources[name]=stripTypeScriptTypes((await readFile(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,''));
function setup({validAuth=true}={}){
 const rows={team_permissions:[{user_id:user,active:true,role:'ADMIN',listed:true},{user_id:other,active:true,role:'SALES',listed:true}],callcenter_profiles:[{user_id:user,disabled_at:null},{user_id:other,disabled_at:null}],callcenter_phone_assignments:[{user_id:user,phone_number_id:'a'},{user_id:other,phone_number_id:'b'}],callcenter_phone_numbers:[{id:'a',phone_number:'+17026700880',active:true,twilio_status:'ready'},{id:'b',phone_number:'+17024106621',active:true,twilio_status:'ready'}]};
 let reads=0,issued,signatureInput;const starts=[];
 const db={rpc:async(name,args)=>{if(name==='outreach_access_status')return {data:{is_paused:!!env.PAUSED},error:env.FAIL_ACCESS?{message:'failed'}:null};starts.push({name,args});return {error:env.FAIL_TRANSCRIPT?{message:'failed'}:null}},auth:{getUser:async jwt=>validAuth&&jwt==='valid-jwt'?{data:{user:{id:user}}}:{error:{message:'bad token'}}},from(table){reads++;const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){return {data:structuredClone(rows[table].find(x=>filters.every(([k,v])=>x[k]===v))||null)}}};return q}};
 class Token{static VoiceGrant=class{constructor(options){this.options=options}};constructor(a,k,s,options){this.options=options;issued=this}addGrant(grant){this.grant=grant}toJwt(){return 'signed-by-sdk'}}
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'auth-token',TWILIO_API_KEY_SID:'SKtest',TWILIO_API_KEY_SECRET:'key-secret',TWILIO_TWIML_APP_SID:'APtest',TWILIO_CALLER_ID:'+17023726399'};
 const handlers={};for(const [name,source] of Object.entries(sources))vm.runInNewContext(source,{URLSearchParams,Response,console:{error(){}},createClient:()=>db,twilio:{jwt:{AccessToken:Token},validateRequest:(token,signature,url,params)=>{signatureInput={token,url,params};return signature==='valid-signature'}},Deno:{env:{get:k=>env[k]},serve:fn=>{handlers[name]=fn}}});
 const token=()=>handlers['twilio-voice-token'](new Request('https://example.supabase.co/functions/v1/twilio-voice-token',{method:'POST',headers:{Authorization:'Bearer valid-jwt'}}));
 const call=(params={},signature='valid-signature')=>handlers['twilio-voice-outbound'](new Request('https://example.supabase.co/functions/v1/twilio-voice-outbound',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':signature},body:new URLSearchParams({AccountSid:'ACtest',CallSid:'CA'+'1'.repeat(32),From:'client:user_'+user.replace(/-/g,''),To:'7025550100',...params})}));
 return {starts,rows,token,call,env,issued:()=>issued,reads:()=>reads,signature:()=>signatureInput};
}
test('token verifies the login, preserves identity format, and reports the assigned caller ID',async()=>{
 const s=setup();const result=await s.token();assert.equal(result.status,200);const data=await result.json();assert.equal(data.caller_id,'+17026700880');assert.equal(data.identity,'user_'+user.replace(/-/g,''));assert.equal(s.issued().grant.options.outgoingApplicationSid,'APtest');
});
test('invalid login receives no token and performs no assignment reads',async()=>{
 const s=setup({validAuth:false});assert.equal((await s.token()).status,401);assert.equal(s.reads(),0);
});
test('different signed identities use different Admin assignments and ignore global or browser caller IDs',async()=>{
 const s=setup();const first=await (await s.call({agent_user_id:other,callerId:'+17023726399'})).text();assert.match(first,/callerId="\+17026700880"/);assert.doesNotMatch(first,/3726399/);
 const second=await (await s.call({From:'client:user_'+other.replace(/-/g,'')})).text();assert.match(second,/callerId="\+17024106621"/);
 assert.match(first,/<Number>\+17025550100<\/Number>/);
});
test('assignment changes take effect on the next call without a new token',async()=>{
 const s=setup();await s.token();s.rows.callcenter_phone_assignments[0].phone_number_id='b';assert.match(await (await s.call()).text(),/callerId="\+17024106621"/);
});
test('unassigned, disabled, pending, malformed or revoked callers never receive Dial TwiML',async()=>{
 for(const change of [s=>s.rows.callcenter_phone_assignments.splice(0,1),s=>s.rows.callcenter_phone_numbers[0].active=false,s=>s.rows.callcenter_phone_numbers[0].twilio_status='pending',s=>s.rows.callcenter_phone_numbers[0].phone_number='invalid',s=>s.rows.team_permissions[0].active=false,s=>s.rows.callcenter_profiles[0].disabled_at='now']){
  const s=setup();change(s);assert.equal((await s.token()).status,403);const xml=await (await s.call()).text();assert.doesNotMatch(xml,/<Dial/);assert.match(xml,/<Hangup/);
 }
});
test('invalid Twilio signature, wrong account, or arbitrary From cannot query assignments',async()=>{
 for(const [params,signature] of [[{},'bad'],[{AccountSid:'another'},'valid-signature'],[{From:'+17023726399'},'valid-signature']]){
  const s=setup();assert.equal((await s.call(params,signature)).status,403);assert.equal(s.reads(),0);
 }
});
test('signature validation receives the exact public endpoint and every form parameter',async()=>{
 const s=setup();s.env.TWILIO_OUTBOUND_WEBHOOK_URL='https://example.supabase.co/functions/v1/twilio-voice-outbound';await s.call({extra:'signed value'});
 assert.equal(s.signature().url,s.env.TWILIO_OUTBOUND_WEBHOOK_URL);assert.equal(s.signature().params.extra,'signed value');
});
test('invalid destination never dials, and optional transcription remains supported',async()=>{
 const s=setup();assert.doesNotMatch(await (await s.call({To:'not-a-number'})).text(),/<Dial/);
 const xml=await (await s.call({transcribe:'true',crm_id:'lead-123'})).text();assert.match(xml,/<Start><Transcription/);assert.match(xml,/name="crm_lead-123"/);assert.match(xml,/track="both_tracks"/);
});

test('transcription is bound to signed identity and browser parent call before dialing',async()=>{
 const s=setup();const xml=await (await s.call({transcribe:'true',crm_id:'lead-123',agent_user_id:other})).text();
 assert.deepEqual({...s.starts[0].args},{p_call_sid:'CA'+'1'.repeat(32),p_user_id:user,p_crm_id:'lead-123'});
 assert.match(xml,/inboundTrackLabel="agent" outboundTrackLabel="customer"/);
 assert.match(xml,/transcriptionEngine="google"/);
 s.env.FAIL_TRANSCRIPT=true;const failed=await s.call({transcribe:'true',crm_id:'lead-123'});
 assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/<Dial/);
});

test('a pause revokes tokens and calls immediately, and clearing it restores access',async()=>{
 const s=setup();await s.token();s.env.PAUSED=true;
 assert.equal((await s.token()).status,403);assert.doesNotMatch(await (await s.call()).text(),/<Dial/);
 s.env.PAUSED=false;assert.equal((await s.token()).status,200);assert.match(await (await s.call()).text(),/<Dial/);
 s.env.FAIL_ACCESS=true;assert.doesNotMatch(await (await s.call()).text(),/<Dial/);
});
