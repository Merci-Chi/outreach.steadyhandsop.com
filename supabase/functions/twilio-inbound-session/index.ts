import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';
import webpush from 'npm:web-push@3.6.7';
function resolveRoutingSettings(saved) {
 // Admin number routing is authoritative; legacy per-user toggles do not block it.
 return {outreach_ring_seconds:20,...saved,enabled:true,cellphone_number:null};
}


const identity = (userId:string) => 'sh_inbound_' + userId;
const origin='https://outreach.steadyhandsop.com';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw Error('Supabase server settings are missing');
  const db=createClient(url,key,{auth:{persistSession:false}});
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:auth,error:authError}=await db.auth.getUser(jwt);
  if(authError||!auth?.user)return json({error:'Sign in again.'},401);
  const userId=auth.user.id;
  const checked=async(result:any)=>{if(result.error)throw result.error;return result.data;};
  const access=await checked(await db.rpc('outreach_access_status',{p_user_id:userId}));
  if(typeof access?.is_paused!=='boolean')throw Error('Could not verify account access.');
  if(access.is_paused)return json({error:'Outreach is paused. Complete required actions and agreements, then recheck access.'},403);
  const permission=await checked(await db.from('team_permissions').select('role,active,listed').eq('user_id',userId).maybeSingle());
  const profile=await checked(await db.from('callcenter_profiles').select('disabled_at').eq('user_id',userId).maybeSingle());
  if(!permission?.active||permission.listed===false||!['ADMIN','SALES'].includes(permission.role)||!profile||profile.disabled_at)return json({error:'Active sales or admin access required.'},403);
  const body=await req.json();
  const action=String(body.action||'token');
  const loadRouting=async()=>{
   const saved=await checked(await db.from('outreach_inbound_settings').select('*').eq('user_id',userId).maybeSingle());
   return {settings:resolveRoutingSettings(saved),routing_source:'twilio'};
  };
  if(action==='push_config'){
   const publicKey=Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')||'';
   return json({public_key:publicKey,configured:Boolean(publicKey&&Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')&&Deno.env.get('WEB_PUSH_VAPID_SUBJECT'))});
  }
  if(action==='push_status'||action==='push_test'){
   const endpoint=String(body.endpoint||'');
   const subscription=await checked(await db.from('outreach_inbound_push_subscriptions').select('endpoint,p256dh,auth,enabled,last_attempt_at,last_success_at,last_error').eq('user_id',userId).eq('endpoint',endpoint).maybeSingle());
   const publicKey=Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')||'',privateKey=Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')||'',subject=Deno.env.get('WEB_PUSH_VAPID_SUBJECT')||'';
   const configured=Boolean(publicKey&&privateKey&&subject);
   if(action==='push_status')return json({configured,enrolled:Boolean(subscription?.enabled),last_attempt_at:subscription?.last_attempt_at||null,last_success_at:subscription?.last_success_at||null,last_error:subscription?.last_error||null});
   if(!configured)return json({error:'Server push keys are missing. Configure the three WEB_PUSH_VAPID secrets.'},503);
   if(!subscription?.enabled)return json({error:'Enable device call alerts on this device first.'},404);
   const attempted=new Date().toISOString();
   try{
    await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify({kind:'call-alert-test',title:'Steady Hands call alerts',body:'Device call notifications are working.',tag:'steadyhands-call-alert-test',url:'/index.html'}),{vapidDetails:{publicKey,privateKey,subject},TTL:30,urgency:'high',timeout:4000});
    await checked(await db.from('outreach_inbound_push_subscriptions').update({last_attempt_at:attempted,last_success_at:new Date().toISOString(),last_error:null}).eq('user_id',userId).eq('endpoint',endpoint));
    return json({ok:true,message:'Push service accepted the test alert. If it does not appear, check this device’s notification and Focus settings.'});
   }catch(error){
    const code=Number(error.statusCode)||0;
    const message=[404,410].includes(code)?'This device subscription expired. Enable device call alerts again.':[400,401,403].includes(code)?'Push service rejected the request ('+code+'). Check the matching VAPID public/private keys and subject.':'Push delivery failed. Check the function logs and try again.';
    await db.from('outreach_inbound_push_subscriptions').update({last_attempt_at:attempted,last_error:message,...([404,410].includes(code)?{enabled:false}:{})}).eq('user_id',userId).eq('endpoint',endpoint);
    console.error('Call alert test failed:',code||error.message);
    return json({error:message},502);
   }
  }
  if(action==='push_subscribe'){
   const subscription=body.subscription;
   if(!validPushSubscription(subscription))return json({error:'Invalid browser push subscription.'},400);
   if(!Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')||!Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')||!Deno.env.get('WEB_PUSH_VAPID_SUBJECT'))return json({error:'Server push keys are not configured.'},503);
   await checked(await db.from('outreach_inbound_push_subscriptions').upsert({user_id:userId,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth,enabled:true,updated_at:new Date().toISOString()},{onConflict:'endpoint'}));
   return json({ok:true});
  }
  if(action==='push_disable'){
   await checked(await db.from('outreach_inbound_push_subscriptions').update({enabled:false,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('endpoint',String(body.endpoint||'')));
   return json({ok:true});
  }
  if(action==='device_ready'){
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.device_id||''))return json({error:'Invalid device ID.'},400);
   await checked(await db.from('outreach_inbound_devices').upsert({user_id:userId,device_id:body.device_id,ready:body.ready===true,updated_at:new Date().toISOString()},{onConflict:'user_id,device_id'}));
   return json({ok:true});
  }
  if(action==='call_received'){
   const callSid=String(body.call_sid||'');
   if(!/^CA[0-9a-fA-F]{32}$/.test(callSid))return json({error:'Invalid call SID.'},400);
   await checked(await db.from('outreach_inbound_calls').update({browser_alerted_at:new Date().toISOString()}).eq('call_sid',callSid).eq('user_id',userId).eq('route_destination','app'));
   return json({ok:true});
  }
  if(action==='transcript'){
   const callSid=String(body.call_sid||'');
   if(!/^CA[0-9a-fA-F]{32}$/.test(callSid))return json({error:'Invalid call SID.'},400);
   const call=await checked(await db.from('outreach_inbound_calls').select('call_sid').eq('call_sid',callSid).eq('user_id',userId).maybeSingle());
   if(!call)return json({error:'Incoming call not found.'},404);
   const transcript=await checked(await db.from('callcenter_transcripts').select('id,call_sid,segments,transcript,interim_segments,transcript_revision,transcription_status,transcription_error').eq('call_sid',callSid).eq('user_id',userId).maybeSingle());
   return json({transcript});
  }
  if(action==='settings'){
   const routing=await loadRouting();
   const calls=await checked(await db.from('outreach_inbound_calls').select('call_sid,from_number,to_number,status,answered_via,recording_sid,recording_duration,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(50));
   return json({...routing,calls});
  }
  if(action==='save_settings')return json({error:'Voicemail greetings are managed in Admin → Phone Numbers.'},403);
  if(action==='play_voicemail'){
   const call=await checked(await db.from('outreach_inbound_calls').select('recording_sid').eq('call_sid',String(body.call_sid||'')).eq('user_id',userId).maybeSingle());
   if(!/^RE[0-9a-fA-F]{32}$/.test(call?.recording_sid||''))return json({error:'Voicemail not found.'},404);
   const sid=Deno.env.get('TWILIO_ACCOUNT_SID')||'',token=Deno.env.get('TWILIO_AUTH_TOKEN')||'';
   if(!sid||!token)throw Error('Twilio recording settings are missing');
   let mediaURL=`https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${call.recording_sid}.mp3`;
   let audio:Response;
   for(let hop=0;;hop++){
    const media=new URL(mediaURL);
    const allowed=media.protocol==='https:'&&(media.hostname==='api.twilio.com'||media.hostname.endsWith('.twilio.com')||media.hostname.endsWith('.twiliocdn.com')||media.hostname.endsWith('.amazonaws.com'));
    if(!allowed)throw Error('Unexpected recording media destination');
    audio=await fetch(mediaURL,{headers:media.hostname==='api.twilio.com'?{Authorization:'Basic '+btoa(sid+':'+token)}:{},redirect:'manual'});
    if(![301,302,303,307,308].includes(audio.status))break;
    if(hop>=2||!audio.headers.get('location'))throw Error('Recording redirect failed');
    mediaURL=new URL(audio.headers.get('location')!,mediaURL).toString();
   }
   if(!audio.ok)throw Error('Voicemail audio is not available yet. Try again shortly.');
   const bytes=new Uint8Array(await audio.arrayBuffer());
   if(bytes.length>5_000_000)throw Error('This recording is too large to play here.');
   let binary='';for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
   return json({audio_base64:btoa(binary),mime:'audio/mpeg'});
  }
  if(action!=='token')return json({error:'Unknown action'},400);
  const assignment=await checked(await db.from('callcenter_phone_assignments').select('phone_number_id').eq('user_id',userId).maybeSingle());
  if(!assignment)return json({error:'Ask your administrator to assign a Twilio Ready number first.'},403);
  const number=await checked(await db.from('callcenter_phone_numbers').select('phone_number,active,twilio_status,inbound_destination,inbound_forward_number').eq('id',assignment.phone_number_id).maybeSingle());
  if(!number?.active||number.twilio_status!=='ready')return json({error:'Your assigned calling number is not enabled and Twilio Ready.'},403);
  if(number.inbound_destination==='forward')return json({destination:'forward',number:number.phone_number,forward_number:number.inbound_forward_number});
  const {settings}=await loadRouting();
  if(!settings?.enabled)return json({error:'Ask your administrator to check incoming routing in Admin → Phone Numbers.'},403);
  const account=Deno.env.get('TWILIO_ACCOUNT_SID')||'',apiKey=Deno.env.get('TWILIO_API_KEY_SID')||'',secret=Deno.env.get('TWILIO_API_KEY_SECRET')||'';
  if(!account||!apiKey||!secret)throw Error('Twilio incoming-token settings are missing');
  const AccessToken=twilio.jwt.AccessToken;
  const token=new AccessToken(account,apiKey,secret,{identity:identity(userId),ttl:3600});
  token.addGrant(new AccessToken.VoiceGrant({incomingAllow:true}));
  return json({token:token.toJwt(),number:number.phone_number});
 }catch(error){console.error('Inbound session failed:',error);return json({error:'Inbound setup is unavailable. Check the deployed functions and server settings.'},500);}
});

function validPushSubscription(subscription) {
 try {
  const endpoint=new URL(subscription?.endpoint);
  const host=endpoint.hostname;
  const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
  return endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&(!endpoint.port||endpoint.port==='443')&&allowed&&subscription.endpoint.length<=4096&&/^[A-Za-z0-9_-]{87}=?$/.test(subscription.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22}={0,2}$/.test(subscription.keys?.auth||'');
 } catch { return false; }
}
