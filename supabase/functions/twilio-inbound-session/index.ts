import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';
function resolveRoutingSettings(saved) {
 // Twilio rings the assigned browser identity; personal numbers are never used.
 return {enabled:true,outreach_ring_seconds:20,...saved,cellphone_number:null};
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
  const permission=await checked(await db.from('team_permissions').select('role,active,listed').eq('user_id',userId).maybeSingle());
  const profile=await checked(await db.from('callcenter_profiles').select('disabled_at').eq('user_id',userId).maybeSingle());
  if(!permission?.active||permission.listed===false||!['ADMIN','SALES'].includes(permission.role)||!profile||profile.disabled_at)return json({error:'Active sales or admin access required.'},403);
  const body=await req.json();
  const action=String(body.action||'token');
  const loadRouting=async()=>{
   const saved=await checked(await db.from('outreach_inbound_settings').select('*').eq('user_id',userId).maybeSingle());
   return {settings:resolveRoutingSettings(saved),routing_source:'twilio'};
  };
  if(action==='settings'){
   const routing=await loadRouting();
   const calls=await checked(await db.from('outreach_inbound_calls').select('call_sid,from_number,to_number,status,answered_via,recording_sid,recording_duration,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(50));
   return json({...routing,calls});
  }
  if(action==='save_settings'){
   const greeting=String(body.voicemail_greeting||'').trim();
   if(!greeting||greeting.length>500)return json({error:'Enter a voicemail greeting between 1 and 500 characters.'},400);
   await checked(await db.from('outreach_inbound_settings').upsert({user_id:userId,cellphone_number:null,enabled:body.enabled===true,voicemail_greeting:greeting,outreach_ring_seconds:20,cellphone_ring_seconds:20,updated_at:new Date().toISOString()}));
   return json({ok:true});
  }
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
  const number=await checked(await db.from('callcenter_phone_numbers').select('phone_number,active,twilio_status').eq('id',assignment.phone_number_id).maybeSingle());
  if(!number?.active||number.twilio_status!=='ready')return json({error:'Your assigned calling number is not enabled and Twilio Ready.'},403);
  const {settings}=await loadRouting();
  if(!settings?.enabled)return json({error:'Incoming routing is disabled. Enable it in Incoming calls → Voicemail settings.'},403);
  const account=Deno.env.get('TWILIO_ACCOUNT_SID')||'',apiKey=Deno.env.get('TWILIO_API_KEY_SID')||'',secret=Deno.env.get('TWILIO_API_KEY_SECRET')||'';
  if(!account||!apiKey||!secret)throw Error('Twilio incoming-token settings are missing');
  const AccessToken=twilio.jwt.AccessToken;
  const token=new AccessToken(account,apiKey,secret,{identity:identity(userId),ttl:3600});
  token.addGrant(new AccessToken.VoiceGrant({incomingAllow:true}));
  return json({token:token.toJwt(),number:number.phone_number});
 }catch(error){console.error('Inbound session failed:',error);return json({error:'Inbound setup is unavailable. Check the deployed functions and server settings.'},500);}
});
