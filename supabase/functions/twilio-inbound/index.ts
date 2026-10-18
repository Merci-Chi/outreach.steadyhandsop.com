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
function phoneDial(base,call,settings={}) {
 return response(`<Dial answerOnBridge="true" timeout="25" callerId="${escapeXML(call.to_number)}" action="${escapeXML(endpoint(base,'phone-ended'))}" method="POST"><Number url="${escapeXML(endpoint(base,'screen',call.call_sid))}" method="POST">${escapeXML(call.forward_number)}</Number></Dial>`);
}
function screen(base,parent) {
 return response(`<Gather numDigits="1" timeout="7" action="${escapeXML(endpoint(base,'accept-cell',parent))}" method="POST"><Say>Incoming Steady Hands call. Press 1 to answer.</Say></Gather><Hangup/>`);
}
function voicemail(base,greeting) {
  return response(`<Say>${escapeXML(greeting||'Thank you for calling Steady Hands. Please leave your name, number, and message after the beep.')}</Say><Record maxLength="120" timeout="5" playBeep="true" action="${escapeXML(endpoint(base,'goodbye'))}" method="POST" recordingStatusCallback="${escapeXML(endpoint(base,'recorded'))}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/><Hangup/>`);
}
const answered = status => status==='completed';

function resolveRoutingSettings(saved) {
 // Admin number routing is authoritative; legacy per-user toggles do not block it.
 return {outreach_ring_seconds:20,...saved,enabled:true,cellphone_number:null};
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
   const number=await checked(await db.from('callcenter_phone_numbers').select('id,phone_number,active,twilio_status,inbound_destination,inbound_forward_number').eq('phone_number',form.To).maybeSingle());
   if(!number?.active||number.twilio_status!=='ready')return xml(response('<Say>This number is unavailable.</Say><Hangup/>'));
   const assignment=await checked(await db.from('callcenter_phone_assignments').select('user_id').eq('phone_number_id',number.id).maybeSingle());
   if(!assignment?.user_id)return xml(hangup());
   const permission=await checked(await db.from('team_permissions').select('role,active,listed').eq('user_id',assignment.user_id).maybeSingle());
   const profile=await checked(await db.from('callcenter_profiles').select('disabled_at').eq('user_id',assignment.user_id).maybeSingle());
   if(!permission?.active||permission.listed===false||!['ADMIN','SALES'].includes(permission.role)||!profile||profile.disabled_at)return xml(hangup());
   const destination=number.inbound_destination||'app';
   const forward=destination==='forward'?number.inbound_forward_number:null;
   if(destination==='forward'){
    if(!/^\+[1-9]\d{7,14}$/.test(forward||'')||forward===number.phone_number)throw Error('Invalid forwarding route');
    const managed=await checked(await db.from('callcenter_phone_numbers').select('id').eq('phone_number',forward).limit(1));
    if(managed?.length)throw Error('Forwarding to another managed number is not allowed');
   }
   await checked(await db.from('outreach_inbound_calls').upsert({call_sid:callSid,user_id:assignment.user_id,from_number:form.From||'Unknown',to_number:form.To,route_destination:destination,forward_number:forward},{onConflict:'call_sid',ignoreDuplicates:true}));
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
  if(stage==='incoming'){
   if(call.route_destination==='forward'){await patch({status:'forwarding'});return xml(phoneDial(base,call,settings));}
   return settings?.enabled?xml(browserDial(base,call,settings)):mailbox();
  }
  if(stage==='browser-ended'){
   if(answered(form.DialCallStatus)){await patch({status:'completed',answered_via:'outreach'});return xml(hangup());}
   return mailbox();
  }
  if(stage==='screen'){
   if(call.route_destination!=='forward')return xml(hangup());
   await patch({forwarded_sid:form.CallSid,cellphone_accepted:false});
   return xml(screen(base,callSid));
  }
  if(stage==='accept-cell'){
   if(call.route_destination!=='forward'||form.Digits!=='1'||call.forwarded_sid!==form.CallSid)return xml(hangup());
   await patch({cellphone_accepted:true});return xml(response('<Say>Connecting.</Say>'));
  }
  if(stage==='phone-ended'){
   if(call.route_destination==='forward'&&answered(form.DialCallStatus)&&call.cellphone_accepted){await patch({status:'completed',answered_via:'phone'});return xml(hangup());}
   return mailbox();
  }
  if(stage==='cell-ended')return mailbox();
  return new Response('Unknown stage',{status:400});
 }catch(error){console.error('Inbound routing failed:',error);return xml(response('<Say>We cannot connect your call right now. Please try again shortly.</Say><Hangup/>'),500);}
});
