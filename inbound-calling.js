import {Device} from './twilio-sdk.js?v=2.18.5-browser';
let device=null,call=null,pending=null,starting=false,userId='',retryTimer=null,desktopNotice=null;
let watchedClient=null,authVersion=0;
const originalTitle=document.title;
const notificationsKey='steadyhands-setting-device-notifications';
const offKey=()=>userId?'steadyhands-incoming-off-'+userId:'';
const readPref=key=>{try{return localStorage.getItem(key)}catch{return null}};
const writePref=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};

const root=document.createElement('div');root.id='shInbound';
root.innerHTML=`<button type="button" id="inboundToggle" aria-expanded="false" aria-controls="inboundPanel">Incoming calls</button><section id="inboundPanel" hidden aria-label="Incoming calls and voicemail"><header><h2>Incoming calls</h2><button type="button" id="inboundClose" aria-label="Close incoming calls">×</button></header><p id="inboundStatus" role="status">Connecting incoming calls… Keep Outreach open to answer.</p><button type="button" id="inboundEnable">Connect incoming calls</button><button type="button" id="inboundDisable" hidden>Go offline</button><button type="button" id="inboundAlerts">Enable device call alerts</button><p id="inboundAlertStatus" role="status"></p><p>Answer calls here using this device’s microphone and speakers. Closed or suspended app windows cannot receive browser calls.</p><details><summary>Voicemail settings</summary><form id="inboundSettings"><label>Business voicemail greeting<textarea id="inboundGreeting" rows="4" maxlength="500" required>Thank you for calling Steady Hands. Please leave your name, number, and a message after the beep.</textarea></label><p>Incoming destinations are managed in Admin. For Outreach app reception, keep this app open. Unanswered calls go to this voicemail.</p><button type="submit">Save routing settings</button><p id="inboundSaveStatus" role="status"></p></form></details><div id="inboundActive" hidden role="region" aria-label="Incoming call" aria-live="assertive"><strong id="inboundCaller"></strong><p id="inboundCallStatus"></p><button type="button" id="inboundAnswer">Answer</button><button type="button" id="inboundDecline">Send to voicemail</button><button type="button" id="inboundMute" hidden>Mute</button><button type="button" id="inboundEnd" hidden>End call</button></div><h3>Recent calls & voicemail</h3><button type="button" id="inboundRefresh">Refresh inbox</button><div id="inboundInbox"></div></section>`;
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
function closeNotice(){
 desktopNotice?.close();desktopNotice=null;
 navigator.serviceWorker?.controller?.postMessage({type:'steadyhands:close-incoming-alert'});
}
function resetCall(){call=null;pending=null;closeNotice();document.title=originalTitle;root.classList.remove('is-ringing');$('inboundToggle').textContent='Incoming calls';$('inboundActive').hidden=true;$('inboundMute').textContent='Mute';$('inboundMute').dataset.muted='false';}
async function notifyCall(incoming,missed=false){
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

function bind(incoming){
 const resetThis=()=>{if(call===incoming||pending===incoming)resetCall();};
 incoming.on('cancel',()=>{if(pending===incoming){resetThis();$('inboundToggle').textContent='Missed call';void notifyCall(incoming,true);refresh().catch(()=>{});}});incoming.on('reject',resetThis);
 incoming.on('disconnect',()=>{resetThis();refresh().catch(()=>{});});
 incoming.on('error',error=>{status(error.message||'Incoming call failed.');resetThis();});
 incoming.on('accept',()=>{closeNotice();root.classList.remove('is-ringing');document.title=originalTitle;call=incoming;pending=null;$('inboundCallStatus').textContent='Connected';$('inboundAnswer').hidden=true;$('inboundDecline').hidden=true;$('inboundMute').hidden=false;$('inboundEnd').hidden=false;});
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
   if(call||pending||window.SteadyHandsTwilioVoice?.isActive()){incoming.reject();if(!call&&!pending){$('inboundToggle').textContent='Missed call · Busy';void notifyCall(incoming,true);}return;}
   pending=incoming;bind(incoming);root.classList.add('is-ringing');document.title='Incoming call — Outreach';$('inboundToggle').textContent='Incoming call';void notifyCall(incoming);$('inboundCaller').textContent='Callback from '+(incoming.parameters.From||'Unknown caller');$('inboundCallStatus').textContent='Incoming call';$('inboundActive').hidden=false;$('inboundAnswer').hidden=false;$('inboundDecline').hidden=false;$('inboundMute').hidden=true;$('inboundEnd').hidden=true;open();$('inboundActive').scrollIntoView?.({block:'nearest'});$('inboundAnswer').focus();
  });
  next.on('registered',()=>{status('Ready for incoming calls to '+data.number+'. Keep Outreach open.');$('inboundEnable').hidden=true;$('inboundDisable').hidden=false;});
  next.on('unregistered',()=>{status('Offline — browser ringing is off.');$('inboundEnable').hidden=false;$('inboundDisable').hidden=true;if(device===next){device=null;next.destroy();}scheduleReconnect();});
  next.on('tokenWillExpire',async()=>{try{const fresh=await invoke('token');if(fresh.destination==='forward'){await next.unregister();return;}next.updateToken(fresh.token);}catch(error){status(error.message);await next.unregister();}});
  next.on('error',error=>status(error.message||'Incoming phone error.'));
  await next.register();
 }catch(error){if(device){const failed=device;device=null;failed.destroy();}status(error.message||'Could not enable incoming calls.');scheduleReconnect();}
 finally{starting=false;$('inboundEnable').disabled=false;if(version!==authVersion&&userId)retryTimer=setTimeout(()=>bootstrap(),0);}
}
$('inboundToggle').onclick=async()=>{if($('inboundPanel').hidden){open();try{await refresh();}catch(error){status(error.message);}}else{$('inboundPanel').hidden=true;$('inboundToggle').setAttribute('aria-expanded','false');}};
$('inboundClose').onclick=()=>{$('inboundPanel').hidden=true;$('inboundToggle').setAttribute('aria-expanded','false');$('inboundToggle').focus();};
$('inboundEnable').onclick=()=>enable();
$('inboundDisable').onclick=async()=>{if(call||pending){status('End the current incoming call before going offline.');return;}writePref(offKey(),'true');clearTimeout(retryTimer);if(device)await device.unregister();};
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
 if(!('Notification' in window)){alertStatus('Device call alerts are unavailable in this browser. Incoming calls still appear here.');return;}
 try{
  const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  writePref(notificationsKey,String(permission==='granted'));
  alertStatus(permission==='granted'?'Device call alerts enabled. Keep Outreach open to receive calls.':'Allow notifications for Outreach in your browser settings to enable device alerts.');
 }catch{alertStatus('Device notifications are unavailable. Use the in-app incoming-call alert.');}
};
async function bootstrap(attempt=0){
 const client=window.steadyHandsCRMClient;
 if(!client){if(attempt<30)retryTimer=setTimeout(()=>bootstrap(attempt+1),500);return;}
 if(watchedClient!==client){
  watchedClient=client;
  client.auth.onAuthStateChange?.((_event,session)=>{
   const nextId=session?.user?.id||'';
   if(nextId===userId)return;
   authVersion++;device?.destroy();device=null;resetCall();$('inboundInbox').replaceChildren();userId=nextId;
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
 }catch(error){status(error.message||'Incoming calls could not connect.');scheduleReconnect();}
}
window.addEventListener('online',()=>bootstrap());
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!device&&!starting)void bootstrap();});
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='steadyhands:open-incoming'){open();if(pending)$('inboundAnswer').focus();else void refresh().catch(()=>{});}});
void bootstrap();
