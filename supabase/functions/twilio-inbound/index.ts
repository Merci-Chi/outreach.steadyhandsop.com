import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';
const identity = userId => 'sh_inbound_' + userId;
const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const response = inner => '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + '</Response>';
const hangup = () => response('<Hangup/>');
function endpoint(base, stage, parent='') {
  const url=new URL(base);url.searchParams.set('stage',stage);if(parent)url.searchParams.set('parent',parent);return url.toString();
}
function browserDial(base, call, settings={}) {
  return response(`<Dial answerOnBridge="true" timeout="${settings.outreach_ring_seconds||15}" action="${escapeXML(endpoint(base,'browser-ended'))}" method="POST"><Client><Identity>${escapeXML(identity(call.user_id))}</Identity><Parameter name="businessNumber" value="${escapeXML(call.to_number)}"/></Client></Dial>`);
}
function voicemail(base,greeting) {
  return response(`<Say>${escapeXML(greeting||'Thank you for calling Steady Hands. Please leave your name, number, and message after the beep.')}</Say><Record maxLength="120" timeout="5" playBeep="true" action="${escapeXML(endpoint(base,'goodbye'))}" method="POST" recordingStatusCallback="${escapeXML(endpoint(base,'recorded'))}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/><Hangup/>`);
}
const answered = status => status==='completed';

function resolveRoutingSettings(saved) {
 // Twilio rings the assigned browser identity; personal numbers are never used.
 return {enabled:true,outreach_ring_seconds:20,...saved,cellphone_number:null};
}


const xml=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/xml; charset=utf-8'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const sid=Deno.env.get('TWILIO_ACCOUNT_SID')||'';
  const token=Deno.env.get('TWILIO_AUTH_TOKEN')||'';
  // Must be the exact public function URL entered in Twilio (no query string).
  const base=Deno.env.get('TWILIO_INBOUND_WEBHOOK_URL')||'';
  if(!url||!key||!sid||!token||!base)throw Error('Inbound configuration is incomplete');
  const publicURL=new URL(base);publicURL.search=new URL(req.url).search;
  const form=Object.fromEntries(new URLSearchParams(await req.text()));
  if(!twilio.validateRequest(token,req.headers.get('X-Twilio-Signature')||'',publicURL.toString(),form)||form.AccountSid!==sid)return new Response('Forbidden',{status:403});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const stage=new URL(req.url).searchParams.get('stage')||'incoming';
  if(stage==='goodbye')return xml(response('<Say>Thank you. Goodbye.</Say><Hangup/>'));
  const parent=new URL(req.url).searchParams.get('parent');
  const callSid=['screen','accept-cell'].includes(stage)?parent:form.CallSid;
  if(!/^CA[0-9a-fA-F]{32}$/.test(callSid||''))return new Response('Invalid call',{status:400});
  const checked=async(result:any)=>{if(result.error)throw result.error;return result.data;};
  let call:any;
  if(stage==='incoming'){
   const number=await checked(await db.from('callcenter_phone_numbers').select('id,phone_number,active,twilio_status').eq('phone_number',form.To).maybeSingle());
   if(!number?.active||number.twilio_status!=='ready')return xml(response('<Say>This number is unavailable.</Say><Hangup/>'));
   const assignment=await checked(await db.from('callcenter_phone_assignments').select('user_id').eq('phone_number_id',number.id).maybeSingle());
   if(!assignment?.user_id)return xml(hangup());
   const permission=await checked(await db.from('team_permissions').select('role,active,listed').eq('user_id',assignment.user_id).maybeSingle());
   const profile=await checked(await db.from('callcenter_profiles').select('disabled_at').eq('user_id',assignment.user_id).maybeSingle());
   if(!permission?.active||permission.listed===false||!['ADMIN','SALES'].includes(permission.role)||!profile||profile.disabled_at)return xml(hangup());
   await checked(await db.from('outreach_inbound_calls').upsert({call_sid:callSid,user_id:assignment.user_id,from_number:form.From||'Unknown',to_number:form.To},{onConflict:'call_sid',ignoreDuplicates:true}));
  }
  call=await checked(await db.from('outreach_inbound_calls').select('*').eq('call_sid',callSid).single());
  if(stage==='recorded'){
   if(form.RecordingStatus==='completed'&&/^RE[0-9a-fA-F]{32}$/.test(form.RecordingSid||''))await checked(await db.from('outreach_inbound_calls').update({recording_sid:form.RecordingSid,recording_duration:Number(form.RecordingDuration)||0,status:'voicemail',updated_at:new Date().toISOString()}).eq('call_sid',callSid));
   return new Response('ok');
  }
  if(stage==='status'){
   if(form.CallStatus==='completed'&&!['completed','voicemail'].includes(call.status))await checked(await db.from('outreach_inbound_calls').update({status:'missed',updated_at:new Date().toISOString()}).eq('call_sid',callSid));
   return new Response('ok');
  }
  if(call.status==='completed'||call.status==='voicemail')return xml(hangup());
  const saved=await checked(await db.from('outreach_inbound_settings').select('*').eq('user_id',call.user_id).maybeSingle());
  const settings=resolveRoutingSettings(saved);
  const mailbox=()=>xml(voicemail(base,settings?.voicemail_greeting));
  const patch=async(p:any)=>checked(await db.from('outreach_inbound_calls').update({...p,updated_at:new Date().toISOString()}).eq('call_sid',callSid));
  if(stage==='incoming')return settings?.enabled?xml(browserDial(base,call,settings)):mailbox();
  if(stage==='browser-ended'){
   if(answered(form.DialCallStatus)){await patch({status:'completed',answered_via:'outreach'});return xml(hangup());}
   return mailbox();
  }
  // Old in-flight cellphone callbacks cannot bridge a personal-number leg.
  if(stage==='screen'||stage==='accept-cell')return xml(hangup());
  if(stage==='cell-ended')return mailbox();
  return new Response('Unknown stage',{status:400});
 }catch(error){console.error('Inbound routing failed:',error);return xml(response('<Say>We cannot connect your call right now. Please try again shortly.</Say><Hangup/>'),500);}
});
