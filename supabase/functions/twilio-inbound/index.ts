import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';
import webpush from 'npm:web-push@3.6.7';
const DEFAULT_VOICEMAIL_GREETING = 'Thank you for calling Steady Hands. We are unavailable to take your call at the moment. Please try again or contact our support team at (702) 775-9756. You may also leave a message after the beep.';
const identity = userId => 'sh_inbound_' + userId;
const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const response = inner => '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + '</Response>';
const hangup = () => response('<Hangup/>');
function endpoint(base, stage, parent='') {
  const url=new URL(base);url.searchParams.set('stage',stage);if(parent)url.searchParams.set('parent',parent);return url.toString();
}
function browserDial(base, call, settings={}, transcription='') {
  return response(transcription + `<Dial answerOnBridge="true" timeout="${settings.outreach_ring_seconds||15}" action="${escapeXML(endpoint(base,'browser-ended'))}" method="POST"><Client><Identity>${escapeXML(identity(call.user_id))}</Identity><Parameter name="businessNumber" value="${escapeXML(call.to_number)}"/><Parameter name="parentCallSid" value="${escapeXML(call.call_sid)}"/></Client></Dial>`);
}
function phoneDial(base,call,settings={}) {
 return response(`<Dial answerOnBridge="true" timeout="25" callerId="${escapeXML(call.to_number)}" action="${escapeXML(endpoint(base,'phone-ended'))}" method="POST"><Number url="${escapeXML(endpoint(base,'screen',call.call_sid))}" method="POST">${escapeXML(call.forward_number)}</Number></Dial>`);
}
function screen(base,parent) {
 return response(`<Gather numDigits="1" timeout="7" action="${escapeXML(endpoint(base,'accept-cell',parent))}" method="POST"><Say>Incoming Steady Hands call. Press 1 to answer.</Say></Gather><Hangup/>`);
}
function voicemail(base,greeting) {
  return response(`<Say>${escapeXML(greeting||DEFAULT_VOICEMAIL_GREETING)}</Say><Record maxLength="120" timeout="5" playBeep="true" action="${escapeXML(endpoint(base,'goodbye'))}" method="POST" recordingStatusCallback="${escapeXML(endpoint(base,'recorded'))}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/><Hangup/>`);
}
const answered = status => status==='completed';

function resolveRoutingSettings(saved) {
 // Admin number routing is authoritative; legacy per-user toggles do not block it.
 return {outreach_ring_seconds:20,...saved,enabled:true,cellphone_number:null};
}


const xml=(body:string,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/xml; charset=utf-8'}});
Deno.serve(async req=>{
 // Twilio fetches Play audio by GET without a signed voice form. This route
 // serves only a fixed original melody and never reads account/call data.
 if(req.method==='GET'&&new URL(req.url).searchParams.get('stage')==='hold-music')return holdMusicResponse();
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
   const route=await resolveForwardRoute(number,async phone=>checked(await db.from('callcenter_phone_numbers').select('id,phone_number,active,twilio_status,inbound_destination,inbound_forward_number').eq('phone_number',phone).maybeSingle()));
   const assignment=await checked(await db.from('callcenter_phone_assignments').select('user_id').eq('phone_number_id',route.number.id).maybeSingle());
   let owner=null;
   if(assignment?.user_id){
    const permission=await checked(await db.from('team_permissions').select('role,active,listed').eq('user_id',assignment.user_id).maybeSingle());
    const profile=await checked(await db.from('callcenter_profiles').select('disabled_at').eq('user_id',assignment.user_id).maybeSingle());
    if(permission?.active&&permission.listed!==false&&['ADMIN','SALES'].includes(permission.role)&&profile&&!profile.disabled_at)owner=assignment.user_id;
   }
   if(route.destination==='app'&&owner){
    const access=await checked(await db.rpc('outreach_access_status',{p_user_id:owner}));
    if(typeof access?.is_paused!=='boolean')throw Error('Could not verify account access.');
    if(access.is_paused)return xml(voicemail(base));
   }
   // A PSTN route needs no browser identity; app routes still require an eligible owner.
   if(route.destination==='app'&&!owner)return xml(hangup());
   const {destination,forward}=route;
   await checked(await db.from('outreach_inbound_calls').upsert({call_sid:callSid,user_id:owner,from_number:form.From||'Unknown',to_number:form.To,route_destination:destination,forward_number:forward},{onConflict:'call_sid',ignoreDuplicates:true}));
  }
  if(stage==='incoming'){
   const incoming=await checked(await db.from('outreach_inbound_calls').select('*').eq('call_sid',callSid).single());
   if(incoming.route_destination==='app'&&incoming.user_id&&!incoming.push_wait_until&&!['completed','voicemail','missed'].includes(incoming.status)){
    try{
     const publicKey=Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')||'',privateKey=Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')||'',subject=Deno.env.get('WEB_PUSH_VAPID_SUBJECT')||'';
     if(publicKey&&privateKey&&subject){
      const subscriptions=await checked(await db.from('outreach_inbound_push_subscriptions').select('endpoint,p256dh,auth').eq('user_id',incoming.user_id).eq('enabled',true));
      if(subscriptions?.length){
       const deadline=new Date(Date.now()+30000).toISOString();
       await checked(await db.from('outreach_inbound_calls').update({push_wait_until:deadline}).eq('call_sid',callSid));
       const task=sendIncomingPush(db,subscriptions,incoming,deadline,{publicKey,privateKey,subject}).catch(error=>console.error('Incoming push failed:',error));
       if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(task);else await task;
      }
     }
    }catch(error){console.error('Incoming push setup failed:',error);}
   }
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
  if(call.status==='completed'||call.status==='voicemail'||call.status==='missed')return xml(hangup());
  const saved=call.user_id?await checked(await db.from('outreach_inbound_settings').select('*').eq('user_id',call.user_id).maybeSingle()):null;
  const settings=resolveRoutingSettings(saved);
  // Use the originally dialed business number, including managed forwarding chains.
  // Legacy per-user greetings are deliberately ignored. A missing migration falls
  // back to the business default so a staged deploy does not break reception.
  const business=await db.from('callcenter_phone_numbers').select('voicemail_greeting').eq('phone_number',call.to_number).maybeSingle();
  if(business.error&&!['42703','PGRST204'].includes(business.error.code))throw business.error;
  const greeting=business.data?.voicemail_greeting||DEFAULT_VOICEMAIL_GREETING;
  const mailbox=()=>xml(voicemail(base,greeting));
  const patch=async(p:any)=>checked(await db.from('outreach_inbound_calls').update({...p,updated_at:new Date().toISOString()}).eq('call_sid',callSid));
  if(stage==='incoming'||stage==='wait'){
   if(call.route_destination==='forward'){await patch({status:'forwarding'});return xml(phoneDial(base,call,settings));}
   if(stage==='wait'&&Date.now()>=Date.parse(call.push_wait_until||''))return mailbox();
   if(call.push_wait_until){
    let devices=[];
    try { devices=await checked(await db.from('outreach_inbound_devices').select('updated_at').eq('user_id',call.user_id).eq('ready',true)); }catch(error){console.error('Incoming readiness failed:',error);}
    const recent=devices?.some(device=>Date.parse(device.updated_at)>Date.now()-35000&&(!call.browser_attempted_at||Date.parse(device.updated_at)>Date.parse(call.browser_attempted_at)));
    if(!recent)return xml(waitForApp(base,stage==='incoming',call.push_wait_until));
   }
   await patch({browser_attempted_at:new Date().toISOString()});
   // Transcription is best-effort: configuration errors must not block reception.
   let transcription='';
   try {
    const {data:existing}=await db.from('callcenter_transcripts').select('id').eq('call_sid',callSid).maybeSingle();
    if(!existing){
    await checked(await db.rpc('outreach_start_inbound_transcript',{p_call_sid:callSid}));
    const callback=Deno.env.get('TWILIO_TRANSCRIPTION_CALLBACK_URL')||url.replace(/\/$/,'')+'/functions/v1/twilio-transcription-webhook';
    transcription=`<Start><Transcription name="inbound" statusCallbackUrl="${escapeXML(callback)}" track="both_tracks" inboundTrackLabel="customer" outboundTrackLabel="agent" languageCode="en-US" partialResults="true" enableAutomaticPunctuation="true" transcriptionEngine="google"/></Start>`;
    }
   } catch(error) { console.error('Inbound transcription initialization failed:',error); }
   const ringSettings=call.push_wait_until?{...settings,outreach_ring_seconds:Math.max(1,Math.min(settings.outreach_ring_seconds||20,Math.ceil((Date.parse(call.push_wait_until)-Date.now())/1000)))}:settings;
   return xml(browserDial(base,call,ringSettings,transcription));
  }
  if(stage==='browser-ended'){
   // End capture before any voicemail greeting or recording.
   const stop='<Stop><Transcription name="inbound"/></Stop>';
   let transcript=null;
   try { ({data:transcript}=await db.from('callcenter_transcripts').select('id').eq('call_sid',callSid).maybeSingle()); }
   catch(error) { console.error('Inbound transcription lookup failed:',error); }
   const finish=inner=>xml(response((transcript?stop:'')+inner));
   if(answered(form.DialCallStatus)){await patch({status:'completed',answered_via:'outreach'});return finish('<Hangup/>');}
   const alerted=call.browser_alerted_at&&(!call.browser_attempted_at||Date.parse(call.browser_alerted_at)>=Date.parse(call.browser_attempted_at));
   if(call.push_wait_until&&Date.now()<Date.parse(call.push_wait_until)&&!alerted&&form.DialCallStatus!=='busy'){
    const body=waitForApp(base,false,call.push_wait_until).replace(/^.*?<Response>|<\/Response>$/g,'');
    return xml(response(body));
   }
   const body=voicemail(base,greeting).replace(/^.*?<Response>|<\/Response>$/g,'');
   return finish(body);
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


// Follow managed routes within this webhook; never dial back into another
// managed webhook leg. This avoids repeated screening and PSTN forwarding loops.
async function resolveForwardRoute(number, loadNumber) {
 const visited=new Set();
 let current=number;
 for(let hops=0;hops<100;hops++){
  if(!current?.active||current.twilio_status!=='ready')throw Error('Forwarding destination is unavailable');
  if(visited.has(current.phone_number))throw Error('Forwarding loop detected');
  visited.add(current.phone_number);
  const destination=current.inbound_destination||'app';
  if(destination==='app')return {number:current,destination:'app',forward:null};
  if(destination!=='forward')throw Error('Invalid forwarding route');
  const forward=current.inbound_forward_number;
  if(!/^\+[1-9]\d{7,14}$/.test(forward||'')||visited.has(forward))throw Error('Invalid or looping forwarding route');
  const managed=await loadNumber(forward);
  if(!managed)return {number:current,destination:'forward',forward};
  current=managed;
 }
 throw Error('Forwarding route is too long');
}

function waitForApp(base,announce,deadline) {
 // Short music segments let us recheck registration promptly rather than
 // playing a long track that would delay answering or exceed the deadline.
 const remaining=(Date.parse(deadline)-Date.now())/1000;
 const sound=remaining<2?'<Pause length="1"/>':'<Play>'+escapeXML(endpoint(base,'hold-music'))+'</Play>';
 return response((announce?'<Say>Please hold while we connect your call.</Say>':'')+sound+'<Redirect method="POST">'+escapeXML(endpoint(base,'wait'))+'</Redirect>');
}
function holdMusicResponse() {
 // Original soft arpeggio: 2 seconds, mono 8 kHz PCM16 WAV. No external asset
 // or third-party track is required. Twilio can cache this fixed public audio.
 const rate=8000,samples=rate*2,bytes=new Uint8Array(44+samples*2),view=new DataView(bytes.buffer);
 const label=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
 label(0,'RIFF');view.setUint32(4,bytes.length-8,true);label(8,'WAVE');label(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 label(36,'data');view.setUint32(40,samples*2,true);
 const notes=[261.6256,329.6276,391.9954,329.6276];
 for(let i=0;i<samples;i++){
  const t=i/rate,local=t%0.5,f=notes[Math.min(3,Math.floor(t/0.5))];
  const envelope=Math.min(1,local/0.025)*Math.exp(-local*5)*Math.min(1,(0.5-local)/0.03);
  const tone=Math.sin(2*Math.PI*f*local)+0.16*Math.sin(4*Math.PI*f*local);
  const fade=Math.min(1,t/0.04,(2-t)/0.04);
  view.setInt16(44+i*2,Math.round(32767*0.15*tone*envelope*fade),true);
 }
 return new Response(bytes,{headers:{'Content-Type':'audio/wav','Cache-Control':'public, max-age=86400','Content-Length':String(bytes.length)}});
}
async function sendIncomingPush(db,subscriptions,call,deadline,vapidDetails) {
 const payload=JSON.stringify({kind:'incoming-call',call_sid:call.call_sid,title:'Incoming Steady Hands call',body:'Tap to open Outreach and answer. The caller is waiting.',tag:'steadyhands-incoming-'+call.call_sid,url:'/index.html?incoming='+encodeURIComponent(call.call_sid),expires_at:deadline});
 await Promise.all(subscriptions.map(async subscription=>{
  try {
   await recordPushDelivery(db,call.user_id,subscription.endpoint,{last_attempt_at:new Date().toISOString()});
   await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{vapidDetails,TTL:30,urgency:'high',timeout:4000});
   await recordPushDelivery(db,call.user_id,subscription.endpoint,{last_success_at:new Date().toISOString(),last_error:null});
  }catch(error){
   await recordPushDelivery(db,call.user_id,subscription.endpoint,{last_error:'Push delivery failed ('+(error.statusCode||'network')+').'});
   if([404,410].includes(error.statusCode)){
    await db.from('outreach_inbound_push_subscriptions').delete().eq('user_id',call.user_id).eq('endpoint',subscription.endpoint);
   }else console.error('Incoming push delivery failed:',error.statusCode||error.message);
  }
 }));
}

async function recordPushDelivery(db,userId,endpoint,patch) {
 try { const {error}=await db.from('outreach_inbound_push_subscriptions').update(patch).eq('user_id',userId).eq('endpoint',endpoint);if(error)console.error('Push status could not be saved:',error); }
 catch(error){console.error('Push status could not be saved:',error);}
}
