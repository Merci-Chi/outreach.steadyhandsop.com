import {Device} from './twilio-sdk.js?v=2.18.5-browser';
let device=null,call=null,pending=null,starting=false;
const root=document.createElement('div');root.id='shInbound';
root.innerHTML=`<button type="button" id="inboundToggle" aria-expanded="false" aria-controls="inboundPanel">Incoming calls</button><section id="inboundPanel" hidden aria-label="Incoming calls and voicemail"><header><h2>Incoming calls</h2><button type="button" id="inboundClose" aria-label="Close incoming calls">×</button></header><p id="inboundStatus" role="status">Offline — calls continue to your cellphone when routing is configured.</p><button type="button" id="inboundEnable">Enable on this device</button><button type="button" id="inboundDisable" hidden>Go offline</button><details><summary>Cellphone & voicemail settings</summary><form id="inboundSettings"><label>Your cellphone<input id="inboundCell" type="tel" placeholder="+17025550101" required></label><label><input id="inboundRoutingEnabled" type="checkbox"> Enable Outreach → cellphone → voicemail</label><label>Business voicemail greeting<textarea id="inboundGreeting" rows="4" maxlength="500" required>Thank you for calling Steady Hands. Please leave your name, number, and a message after the beep.</textarea></label><p>Outreach rings first, then your cellphone. Press 1 on your cellphone to accept. Unanswered calls go to this voicemail.</p><button type="submit">Save routing settings</button><p id="inboundSaveStatus" role="status"></p></form></details><div id="inboundActive" hidden><strong id="inboundCaller"></strong><p id="inboundCallStatus"></p><button type="button" id="inboundAnswer">Answer</button><button type="button" id="inboundDecline">Send to cellphone</button><button type="button" id="inboundMute" hidden>Mute</button><button type="button" id="inboundEnd" hidden>End call</button></div><h3>Recent calls & voicemail</h3><button type="button" id="inboundRefresh">Refresh inbox</button><div id="inboundInbox"></div></section>`;
const css=document.createElement('link');css.rel='stylesheet';css.href='inbound-calling.css?v=20261017';document.head.append(css);document.body.append(root);
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
function resetCall(){call=null;pending=null;$('inboundActive').hidden=true;$('inboundMute').textContent='Mute';$('inboundMute').dataset.muted='false';}
function bind(incoming){
 const resetThis=()=>{if(call===incoming||pending===incoming)resetCall();};
 incoming.on('cancel',resetThis);incoming.on('reject',resetThis);
 incoming.on('disconnect',()=>{resetThis();refresh().catch(()=>{});});
 incoming.on('error',error=>{status(error.message||'Incoming call failed.');resetThis();});
 incoming.on('accept',()=>{call=incoming;pending=null;$('inboundCallStatus').textContent='Connected';$('inboundAnswer').hidden=true;$('inboundDecline').hidden=true;$('inboundMute').hidden=false;$('inboundEnd').hidden=false;});
}
async function refresh(){
 const data=await invoke('settings');
 if(data.settings){$('inboundCell').value=data.settings.cellphone_number;$('inboundGreeting').value=data.settings.voicemail_greeting;$('inboundRoutingEnabled').checked=data.settings.enabled;}
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
async function enable(){
 if(starting||device)return;starting=true;$('inboundEnable').disabled=true;
 try{
  // User click primes browser audio/microphone permissions for answering calls.
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());
  const data=await invoke('token');
  const next=new Device(data.token,{logLevel:'warn',closeProtection:true});
  device=next;
  next.on('incoming',incoming=>{
   if(call||pending||window.SteadyHandsTwilioVoice?.isActive()){incoming.reject();return;}
   pending=incoming;bind(incoming);$('inboundCaller').textContent='Callback from '+(incoming.parameters.From||'Unknown caller');$('inboundCallStatus').textContent='Incoming call';$('inboundActive').hidden=false;$('inboundAnswer').hidden=false;$('inboundDecline').hidden=false;$('inboundMute').hidden=true;$('inboundEnd').hidden=true;open();$('inboundAnswer').focus();
  });
  next.on('registered',()=>{status('Ready for incoming calls to '+data.number+'. Keep Outreach open.');$('inboundEnable').hidden=true;$('inboundDisable').hidden=false;});
  next.on('unregistered',()=>{status('Offline — browser ringing is off.');$('inboundEnable').hidden=false;$('inboundDisable').hidden=true;if(device===next){device=null;next.destroy();}});
  next.on('tokenWillExpire',async()=>{try{const fresh=await invoke('token');next.updateToken(fresh.token);}catch(error){status(error.message);await next.unregister();}});
  next.on('error',error=>status(error.message||'Incoming phone error.'));
  await next.register();
 }catch(error){if(device){const failed=device;device=null;failed.destroy();}status(error.message||'Could not enable incoming calls.');}
 finally{starting=false;$('inboundEnable').disabled=false;}
}
$('inboundToggle').onclick=async()=>{if($('inboundPanel').hidden){open();try{await refresh();}catch(error){status(error.message);}}else{$('inboundPanel').hidden=true;$('inboundToggle').setAttribute('aria-expanded','false');}};
$('inboundClose').onclick=()=>{$('inboundPanel').hidden=true;$('inboundToggle').setAttribute('aria-expanded','false');$('inboundToggle').focus();};
$('inboundEnable').onclick=enable;
$('inboundDisable').onclick=async()=>{if(call||pending){status('End the current incoming call before going offline.');return;}if(device)await device.unregister();};
$('inboundAnswer').onclick=()=>{if(!pending)return;if(window.SteadyHandsTwilioVoice?.isActive()){pending.reject();resetCall();return;}pending.accept();};
$('inboundDecline').onclick=()=>{pending?.reject();resetCall();};
$('inboundEnd').onclick=()=>call?.disconnect();
$('inboundMute').onclick=()=>{if(!call)return;const muted=$('inboundMute').dataset.muted!=='true';call.mute(muted);$('inboundMute').dataset.muted=String(muted);$('inboundMute').textContent=muted?'Unmute':'Mute';};
$('inboundRefresh').onclick=()=>refresh().catch(error=>status(error.message));
$('inboundSettings').onsubmit=async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{await invoke('save_settings',{cellphone_number:$('inboundCell').value.trim(),voicemail_greeting:$('inboundGreeting').value.trim(),enabled:$('inboundRoutingEnabled').checked});$('inboundSaveStatus').textContent='Routing settings saved.';if(!$('inboundRoutingEnabled').checked&&device&&!call&&!pending)await device.unregister();}
 catch(error){$('inboundSaveStatus').textContent=error.message;}finally{button.disabled=false;}
};
window.SteadyHandsInboundVoice={isActive:()=>Boolean(call||pending)};
