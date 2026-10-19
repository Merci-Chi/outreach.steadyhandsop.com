import {Device} from './twilio-sdk.js?v=2.18.5-browser';
let device=null,call=null,pending=null,starting=false,userId='',retryTimer=null,desktopNotice=null;
let watchedClient=null,authVersion=0,presenceTimer=null,alertedCallSid='';
const incomingDeviceId=globalThis.crypto?.randomUUID?.()||'';
const callPushScope='/call-push/';
const callPushKey=()=>userId?'steadyhands-call-push-'+userId:'';
const originalTitle=document.title;
const notificationsKey='steadyhands-setting-device-notifications';
const offKey=()=>userId?'steadyhands-incoming-off-'+userId:'';
const readPref=key=>{try{return localStorage.getItem(key)}catch{return null}};
const writePref=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};

const root=document.createElement('div');root.id='shInbound';
root.innerHTML=`<button type="button" id="inboundToggle" aria-expanded="false" aria-controls="inboundPanel">Incoming calls</button><section id="inboundPanel" hidden aria-label="Incoming calls and voicemail"><header><h2>Incoming calls</h2><button type="button" id="inboundClose" aria-label="Close incoming calls">×</button></header><p id="inboundStatus" role="status">Connecting incoming calls… Keep Outreach open to answer.</p><button type="button" id="inboundEnable">Connect incoming calls</button><button type="button" id="inboundDisable" hidden>Go offline</button><button type="button" id="inboundAlerts">Enable device call alerts</button><button type="button" id="inboundAlertsOff">Turn off device call alerts</button><p id="inboundAlertStatus" role="status"></p><p>Answer calls here using this device’s microphone and speakers. Enable device call alerts to receive a notification when Outreach is closed. Tap the notification to reopen Outreach and answer while the caller waits.</p><details><summary>Voicemail settings</summary><form id="inboundSettings"><label>Business voicemail greeting<textarea id="inboundGreeting" rows="4" maxlength="500" required>Thank you for calling Steady Hands. Please leave your name, number, and a message after the beep.</textarea></label><p>Incoming destinations are managed in Admin. For closed-app alerts, enable device call alerts on each device. Unanswered calls go to this voicemail.</p><button type="submit">Save routing settings</button><p id="inboundSaveStatus" role="status"></p></form></details><div id="inboundActive" hidden role="region" aria-label="Incoming call" aria-live="assertive"><strong id="inboundCaller"></strong><p id="inboundCallStatus"></p><button type="button" id="inboundAnswer">Answer</button><button type="button" id="inboundDecline">Send to voicemail</button><button type="button" id="inboundMute" hidden>Mute</button><button type="button" id="inboundEnd" hidden>End call</button></div><section id="inboundTranscriptPanel" hidden><h3>Incoming call transcript</h3><p id="inboundTranscriptStatus" role="status"></p><textarea id="inboundTranscriptText" rows="8" readonly aria-label="Incoming call transcript"></textarea></section><h3>Recent calls & voicemail</h3><button type="button" id="inboundRefresh">Refresh inbox</button><div id="inboundInbox"></div></section>`;
const css=document.createElement('link');css.rel='stylesheet';css.href='inbound-calling.css?v=20261018-alerts';document.head.append(css);document.body.append(root);
const $=id=>root.querySelector('#'+id);
const status=text=>{$('inboundStatus').textContent=text;};
function open(){ $('inboundPanel').hidden=false;$('inboundToggle').setAttribute('aria-expanded','true'); }
async function invoke(action,body={}){
 const client=window.steadyHandsCRMClient;
 if(!client)throw Error('Your CRM session is still loading. Please try again.');
 const {data,error}=await client.functions.invoke('twilio-inbound-session',{body:{action,...body}});
 if(error){let message='Incoming calling has not been set up yet. Please contact your administrator.';try{message=(await error.context.clone().json()).error||message;}catch{}throw Error(message);}
 if(data?.error)throw Error(data.error);return data;
}
async function publishPresence(ready){
 if(!incomingDeviceId)return;
 try { await invoke('device_ready',{device_id:incomingDeviceId,ready}); }
 catch(error){console.warn('Incoming device readiness unavailable:',error.message);}
}
function stopPresence(){clearInterval(presenceTimer);presenceTimer=null;}
function startPresence(){
 stopPresence();if(!incomingDeviceId)return;void publishPresence(true);
 presenceTimer=setInterval(()=>{if(device&&userId)void publishPresence(true)},15000);
}
async function syncCallPush(){
 if(!userId||!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Install Outreach on your Home Screen or use a browser that supports push notifications.');
 const version=authVersion;
 const config=await invoke('push_config');
 if(!config.configured||!config.public_key)throw Error('Closed-app call alerts need server push keys configured by your administrator.');
 const registration=await navigator.serviceWorker.register('/call-push-sw.js',{scope:callPushScope,updateViaCache:'none'});
 // This registration has its own scope; reminder subscriptions are preserved.
 if(!registration.active){await new Promise((resolve,reject)=>{
  const worker=registration.installing||registration.waiting;if(!worker){reject(Error('Notification setup is still loading. Try again.'));return;}
  const timeout=setTimeout(()=>reject(Error('Notification setup timed out. Try again.')),10000);
  const check=()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve();}else if(worker.state==='redundant'){clearTimeout(timeout);reject(Error('Notification setup failed. Try again.'));}};
  worker.addEventListener('statechange',check);check();
 });}
 if(version!==authVersion||!userId)return;
 const padding='='.repeat((4-config.public_key.length%4)%4);
 const bytes=Uint8Array.from(atob((config.public_key+padding).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 let subscription=await registration.pushManager.getSubscription();
 if(subscription?.options?.applicationServerKey){
  const existing=new Uint8Array(subscription.options.applicationServerKey);
  if(existing.length!==bytes.length||existing.some((value,index)=>value!==bytes[index])){await subscription.unsubscribe();subscription=null;}
 }
 if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
 if(version!==authVersion){await subscription.unsubscribe();return;}
 await invoke('push_subscribe',{subscription:subscription.toJSON()});
 if(version!==authVersion){await subscription.unsubscribe();return;}
 writePref(callPushKey(),'true');writePref(notificationsKey,'true');
 $('inboundAlertStatus').textContent='Closed-app call alerts enabled on this device. Tap a call notification to reopen Outreach and answer.';
}
async function disableCallPush(){
 const registration=await navigator.serviceWorker?.getRegistration?.(callPushScope);
 const subscription=await registration?.pushManager.getSubscription();
 if(subscription){
  try { await invoke('push_disable',{endpoint:subscription.endpoint}); }catch{}
  await subscription.unsubscribe();
 }
 writePref(callPushKey(),'false');writePref(notificationsKey,'false');
 $('inboundAlertStatus').textContent='Device call alerts are off. Open Outreach to receive calls here.';
}
function closeNotice(){
 const sid=alertedCallSid;
 if(sid)void navigator.serviceWorker?.getRegistration?.(callPushScope).then(async registration=>{
  const notices=await registration?.getNotifications?.()||[];notices.filter(item=>item.data?.callSid===sid).forEach(item=>item.close());
 }).catch(()=>{});
 desktopNotice?.close();desktopNotice=null;
 navigator.serviceWorker?.controller?.postMessage({type:'steadyhands:close-incoming-alert'});
}
function resetCall(){if(call)drainTranscript();call=null;pending=null;closeNotice();alertedCallSid='';document.title=originalTitle;root.classList.remove('is-ringing');$('inboundToggle').textContent='Incoming calls';$('inboundActive').hidden=true;$('inboundMute').textContent='Mute';$('inboundMute').dataset.muted='false';}
async function notifyCall(incoming,missed=false){
 if(!missed&&readPref(callPushKey())==='true')return;
 if(!('Notification' in window)||Notification.permission!=='granted'||readPref(notificationsKey)!=='true')return;
 const title=missed?'Missed incoming call':'Incoming call';
 const options={body:'From '+(incoming.parameters.From||'Unknown caller'),tag:'steadyhands-incoming-call',requireInteraction:!missed,icon:'images/icon-192.png'};
 try{
  desktopNotice=new Notification(title,options);
  desktopNotice.onclick=()=>{window.focus();open();$('inboundActive').scrollIntoView?.({block:'nearest'});desktopNotice?.close();};
 }catch(error){
  try{
   const registration=await navigator.serviceWorker?.ready;
   if(!missed&&pending!==incoming)return;
   const worker=navigator.serviceWorker?.controller||registration?.active;
   worker?.postMessage({type:'steadyhands:incoming-alert',title,options});
  }catch{console.warn('Device call alerts unavailable; the in-app alert remains active.');}
 }
}
function scheduleReconnect(){if(readPref(offKey())==='true')return;clearTimeout(retryTimer);retryTimer=setTimeout(()=>bootstrap(),30000);}

// Poll the incoming PSTN parent, not the browser child CallSid. Never use the
// currently selected CRM lead to establish ownership or choose a transcript.
let transcriptTimer=null,transcriptSid='',transcriptEpoch=0,transcriptDrain=0,transcriptChannel=null,transcriptClient=null;
const transcriptEvent=detail=>window.dispatchEvent?.(new CustomEvent('steadyhands:inbound-transcript',{detail}));
function stopTranscript(){
 clearInterval(transcriptTimer);transcriptTimer=null;
 if(transcriptChannel)void transcriptClient?.removeChannel?.(transcriptChannel);transcriptChannel=null;transcriptClient=null;transcriptEpoch++;transcriptSid='';transcriptDrain=0;
}
function clearTranscript(){
 stopTranscript();$('inboundTranscriptText').value='';$('inboundTranscriptPanel').hidden=true;
 transcriptEvent({cleared:true});
}
function drainTranscript(){
 if(!transcriptSid)return;transcriptDrain=Date.now()+30000;
 transcriptEvent({callSid:transcriptSid,ended:true});
}
function startTranscript(incoming){
 stopTranscript();
 const sid=incoming.customParameters?.get('parentCallSid');
 $('inboundTranscriptPanel').hidden=false;$('inboundTranscriptText').value='';
 if(!/^CA[0-9a-fA-F]{32}$/.test(sid||'')){
  $('inboundTranscriptStatus').textContent='Incoming transcription requires the updated inbound function.';return;
 }
 transcriptSid=sid;
 transcriptEvent({callSid:sid,started:true});
 const epoch=transcriptEpoch;let busy=false,lastRevision=-1;
 function render(transcript){
  if(epoch!==transcriptEpoch)return;
  if(transcriptDrain&&Date.now()>=transcriptDrain){stopTranscript();return;}
  const revision=Number(transcript?.transcript_revision)||0;
  if(transcript&&revision<lastRevision)return;
  if(transcript)lastRevision=revision;
  const provisional=Object.values(transcript?.interim_segments||{}).filter(part=>part?.text).map(part=>(part.speaker==='agent'?'You':part.speaker==='customer'?'Prospect':'Transcript')+' (speaking…): '+part.text);
  const displayText=[transcript?.transcript||'',...provisional].filter(Boolean).join('\n');
  const message=!transcript?'Waiting for the incoming transcript. Check the transcription deployment if no text appears.':transcript.transcription_status==='error'?'Transcription error: '+(transcript.transcription_error||'Check Twilio logs.'):provisional.length?'Listening… provisional text may change.':'';
  $('inboundTranscriptStatus').textContent=message;$('inboundTranscriptText').value=displayText;
  transcriptEvent({callSid:sid,transcript,displayText,message});
 }
 transcriptClient=window.steadyHandsCRMClient;
 if(transcriptClient?.channel){
  try { transcriptChannel=transcriptClient.channel('incoming-transcript-'+sid+'-'+epoch)
   .on('postgres_changes',{event:'*',schema:'public',table:'callcenter_transcripts',filter:'call_sid=eq.'+sid},payload=>{
    if(payload.new?.call_sid===sid)render(payload.new);
   }).subscribe(state=>{if(state==='SUBSCRIBED')void poll();});
  } catch(error) { console.warn('Live transcript subscription unavailable; using polling.',error); }
 }
 async function poll(){
  if(busy||epoch!==transcriptEpoch)return;
  if(transcriptDrain&&Date.now()>=transcriptDrain){stopTranscript();return;}
  busy=true;
  try{
   const {transcript}=await invoke('transcript',{call_sid:sid});
   if(!transcript&&lastRevision>=0)return;
   render(transcript);
  }catch(error){
   if(epoch!==transcriptEpoch)return;
   $('inboundTranscriptStatus').textContent=error.message;
   transcriptEvent({callSid:sid,message:error.message});
  }finally{busy=false;}
 }
 $('inboundTranscriptStatus').textContent='Waiting for the incoming transcript…';
 transcriptTimer=setInterval(poll,1500);void poll();
}
window.addEventListener('pagehide',clearTranscript);

function bind(incoming){
 const resetThis=()=>{if(call===incoming||pending===incoming)resetCall();};
 incoming.on('cancel',()=>{if(pending===incoming){resetThis();$('inboundToggle').textContent='Missed call';void notifyCall(incoming,true);refresh().catch(()=>{});}});incoming.on('reject',resetThis);
 incoming.on('disconnect',()=>{resetThis();refresh().catch(()=>{});});
 incoming.on('error',error=>{status(error.message||'Incoming call failed.');resetThis();});
 incoming.on('accept',()=>{startTranscript(incoming);closeNotice();root.classList.remove('is-ringing');document.title=originalTitle;call=incoming;pending=null;$('inboundCallStatus').textContent='Connected';$('inboundAnswer').hidden=true;$('inboundDecline').hidden=true;$('inboundMute').hidden=false;$('inboundEnd').hidden=false;});
}
async function refresh(){
 const data=await invoke('settings');
 if(data.settings){$('inboundGreeting').value=data.settings.voicemail_greeting||'Thank you for calling Steady Hands. Please leave your name, number, and a message after the beep.';}
 const inbox=$('inboundInbox');inbox.replaceChildren();
 for(const entry of data.calls||[]){
  const row=document.createElement('article');
  const title=document.createElement('strong');title.textContent=entry.from_number;row.append(title);
  const description=document.createElement('p');description.textContent=new Date(entry.created_at).toLocaleString()+' · '+entry.status+(entry.answered_via?' via '+entry.answered_via:'');row.append(description);
  if(entry.recording_sid){
   const play=document.createElement('button');play.type='button';play.textContent='Play voicemail'+(entry.recording_duration?' · '+entry.recording_duration+'s':'');
   play.onclick=async()=>{play.disabled=true;try{const audio=await invoke('play_voicemail',{call_sid:entry.call_sid});const player=document.createElement('audio');player.controls=true;player.src='data:'+audio.mime+';base64,'+audio.audio_base64;row.append(player);play.remove();await player.play().catch(()=>{});}catch(error){status(error.message);play.disabled=false;}};
   row.append(play);
  }inbox.append(row);
 }
 if(!data.calls?.length)inbox.textContent='No incoming calls yet.';
}
async function enable({automatic=false}={}){
 if(starting||device)return;const version=authVersion;starting=true;$('inboundEnable').disabled=true;
 try{
  if(automatic&&readPref(offKey())==='true'){status('Offline on this device. Connect incoming calls to receive them here.');return;}
  if(!automatic)writePref(offKey(),'false');
  const data=await invoke('token');
  if(version!==authVersion)return;
  if(data.destination==='forward'){status('Incoming calls are set to Phone forwarding: '+data.forward_number+'. Change the destination in Admin to ring Outreach.');scheduleReconnect();return;}
  if(!data.token)throw Error('Incoming call token was not returned.');
  const next=new Device(data.token,{logLevel:'warn',closeProtection:true});
  device=next;
  next.on('incoming',incoming=>{
   const parent=incoming.customParameters?.get('parentCallSid');alertedCallSid=parent||'';
   if(/^CA[0-9a-fA-F]{32}$/.test(parent||''))void invoke('call_received',{call_sid:parent}).catch(()=>{});
   if(call||pending||window.SteadyHandsTwilioVoice?.isActive()){incoming.reject();if(!call&&!pending){$('inboundToggle').textContent='Missed call · Busy';void notifyCall(incoming,true);}return;}
   pending=incoming;bind(incoming);root.classList.add('is-ringing');document.title='Incoming call — Outreach';$('inboundToggle').textContent='Incoming call';void notifyCall(incoming);$('inboundCaller').textContent='Callback from '+(incoming.parameters.From||'Unknown caller');$('inboundCallStatus').textContent='Incoming call';$('inboundActive').hidden=false;$('inboundAnswer').hidden=false;$('inboundDecline').hidden=false;$('inboundMute').hidden=true;$('inboundEnd').hidden=true;open();$('inboundActive').scrollIntoView?.({block:'nearest'});$('inboundAnswer').focus();
  });
  next.on('registered',()=>{startPresence();status('Ready for incoming calls to '+data.number+'. Keep Outreach open.');$('inboundEnable').hidden=true;$('inboundDisable').hidden=false;});
  next.on('unregistered',()=>{stopPresence();void publishPresence(false);status('Offline — browser ringing is off.');$('inboundEnable').hidden=false;$('inboundDisable').hidden=true;if(device===next){device=null;next.destroy();}scheduleReconnect();});
  next.on('tokenWillExpire',async()=>{try{const fresh=await invoke('token');if(fresh.destination==='forward'){await next.unregister();return;}next.updateToken(fresh.token);}catch(error){status(error.message);await next.unregister();}});
  next.on('error',error=>status(error.message||'Incoming phone error.'));
  await next.register();
 }catch(error){if(device){const failed=device;device=null;failed.destroy();}status(error.message||'Could not enable incoming calls.');scheduleReconnect();}
 finally{starting=false;$('inboundEnable').disabled=false;if(version!==authVersion&&userId)retryTimer=setTimeout(()=>bootstrap(),0);}
}
$('inboundToggle').onclick=async()=>{if($('inboundPanel').hidden){open();try{await refresh();}catch(error){status(error.message);}}else{$('inboundPanel').hidden=true;$('inboundToggle').setAttribute('aria-expanded','false');}};
$('inboundClose').onclick=()=>{$('inboundPanel').hidden=true;$('inboundToggle').setAttribute('aria-expanded','false');$('inboundToggle').focus();};
$('inboundEnable').onclick=()=>enable();
$('inboundDisable').onclick=async()=>{if(call||pending){status('End the current incoming call before going offline.');return;}try{await disableCallPush();}catch{writePref(notificationsKey,'false');}stopPresence();void publishPresence(false);writePref(offKey(),'true');clearTimeout(retryTimer);if(device)await device.unregister();};
$('inboundAnswer').onclick=async()=>{
 const incoming=pending;if(!incoming)return;
 if(window.SteadyHandsTwilioVoice?.isActive()){incoming.reject();resetCall();return;}
 $('inboundAnswer').disabled=true;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());
  if(pending!==incoming)return;
  if(window.SteadyHandsTwilioVoice?.isActive()){incoming.reject();resetCall();return;}
  await incoming.accept();
 }catch(error){status(error.message||'Microphone access is required to answer this call.');}
 finally{$('inboundAnswer').disabled=false;}
};
$('inboundDecline').onclick=()=>{pending?.reject();resetCall();};
$('inboundEnd').onclick=()=>call?.disconnect();
$('inboundMute').onclick=()=>{if(!call)return;const muted=$('inboundMute').dataset.muted!=='true';call.mute(muted);$('inboundMute').dataset.muted=String(muted);$('inboundMute').textContent=muted?'Unmute':'Mute';};
$('inboundRefresh').onclick=()=>refresh().catch(error=>status(error.message));
$('inboundSettings').onsubmit=async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{await invoke('save_settings',{voicemail_greeting:$('inboundGreeting').value.trim()});$('inboundSaveStatus').textContent='Routing settings saved.';}
 catch(error){$('inboundSaveStatus').textContent=error.message;}finally{button.disabled=false;}
};
window.SteadyHandsInboundVoice={isActive:()=>Boolean(call||pending)};

$('inboundAlerts').onclick=async()=>{
 const alertStatus=text=>$('inboundAlertStatus').textContent=text;
 if(!('Notification' in window)){alertStatus('Install Outreach on your Home Screen or use a browser that supports notifications.');return;}
 try{
  // Permission must be requested directly from the device's button click.
  const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  if(permission!=='granted'){alertStatus('Allow notifications for Outreach in device settings to enable call alerts.');return;}
  await syncCallPush();
 }catch(error){alertStatus(error.message||'Could not enable device call alerts.');}
};
$('inboundAlertsOff').onclick=()=>disableCallPush().catch(error=>{$('inboundAlertStatus').textContent=error.message;});
async function bootstrap(attempt=0){
 const client=window.steadyHandsCRMClient;
 if(!client){if(attempt<30)retryTimer=setTimeout(()=>bootstrap(attempt+1),500);return;}
 if(watchedClient!==client){
  watchedClient=client;
  client.auth.onAuthStateChange?.((_event,session)=>{
   const nextId=session?.user?.id||'';
   if(nextId===userId)return;
   if(userId&&nextId!==userId){
    const oldKey=callPushKey();writePref(oldKey,'false');
    void navigator.serviceWorker?.getRegistration?.(callPushScope).then(async registration=>{const sub=await registration?.pushManager.getSubscription();await sub?.unsubscribe();}).catch(()=>{});
   }
   stopPresence();authVersion++;clearTranscript();device?.destroy();device=null;resetCall();$('inboundInbox').replaceChildren();userId=nextId;
   clearTimeout(retryTimer);
   if(nextId)retryTimer=setTimeout(()=>bootstrap(),0);else status('Sign in to receive incoming calls.');
  });
 }
 const version=authVersion;
 try{
  const {data,error}=await client.auth.getUser();
  if(version!==authVersion)return;
  if(error||!data?.user){status('Sign in to receive incoming calls.');return;}
  if(userId&&userId!==data.user.id){device?.destroy();device=null;resetCall();}
  userId=data.user.id;
  if(readPref(offKey())==='true'){status('Offline on this device. Connect incoming calls to receive them here.');return;}
  await enable({automatic:true});
  if(readPref(callPushKey())==='true'&&typeof Notification!=='undefined'&&Notification.permission==='granted')void syncCallPush().catch(error=>{$('inboundAlertStatus').textContent=error.message;});
 }catch(error){status(error.message||'Incoming calls could not connect.');scheduleReconnect();}
}
window.addEventListener('online',()=>bootstrap());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(device)startPresence();else if(!starting)void bootstrap();}});
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='steadyhands:incoming-wake'){if(device)void publishPresence(true);return;}if(event.data?.type==='steadyhands:open-incoming'){open();if(device)void publishPresence(true);if(readPref(offKey())==='true'){$('inboundStatus').textContent='This device is offline. Connect incoming calls to answer.';}else if(!device)void bootstrap();if(pending)$('inboundAnswer').focus();else void refresh().catch(()=>{});}});
if(window.location&&/^CA[0-9a-fA-F]{32}$/.test(new URLSearchParams(window.location.search).get('incoming')||''))open();
window.addEventListener('pageshow',()=>{if(device)startPresence();});
window.addEventListener('pagehide',()=>{stopPresence();void publishPresence(false);});
void bootstrap();
