export const identity = userId => 'sh_inbound_' + userId;
export const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const response = inner => '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + '</Response>';
export const hangup = () => response('<Hangup/>');
export function endpoint(base, stage, parent='') {
  const url=new URL(base);url.searchParams.set('stage',stage);if(parent)url.searchParams.set('parent',parent);return url.toString();
}
export function browserDial(base, call, settings={}) {
  return response(`<Dial answerOnBridge="true" timeout="${settings.outreach_ring_seconds||15}" action="${escapeXML(endpoint(base,'browser-ended'))}" method="POST"><Client><Identity>${escapeXML(identity(call.user_id))}</Identity><Parameter name="businessNumber" value="${escapeXML(call.to_number)}"/></Client></Dial>`);
}
export function cellphoneDial(base, call, settings) {
  return response(`<Dial answerOnBridge="true" timeout="${settings.cellphone_ring_seconds||20}" callerId="${escapeXML(call.to_number)}" action="${escapeXML(endpoint(base,'cell-ended'))}" method="POST"><Number url="${escapeXML(endpoint(base,'screen',call.call_sid))}" method="POST">${escapeXML(settings.cellphone_number)}</Number></Dial>`);
}
export function screen(base,parent) {
  return response(`<Gather numDigits="1" timeout="7" action="${escapeXML(endpoint(base,'accept-cell',parent))}" method="POST"><Say>Steady Hands callback. Press 1 to accept this call.</Say></Gather><Hangup/>`);
}
export function voicemail(base,greeting) {
  return response(`<Say>${escapeXML(greeting||'Thank you for calling Steady Hands. Please leave your name, number, and message after the beep.')}</Say><Record maxLength="120" timeout="5" playBeep="true" action="${escapeXML(endpoint(base,'goodbye'))}" method="POST" recordingStatusCallback="${escapeXML(endpoint(base,'recorded'))}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/><Hangup/>`);
}
export const answered = status => status==='completed';
export const acceptedCell = (status,call) => answered(status) && call.cellphone_accepted===true;

export function normalizeCellphone(value) {
 const raw=String(value??'').trim();
 if(!/^\+?[\d\s().-]+$/.test(raw))return '';
 let digits=raw.replace(/\D/g,'');
 if(!raw.startsWith('+')){
  if(digits.length===10)digits='1'+digits;
  else if(digits.length!==11||!digits.startsWith('1'))return '';
 }
 const phone='+'+digits;
 return /^\+[1-9]\d{7,14}$/.test(phone)?phone:'';
}
export function resolveRoutingSettings(saved,profilePhone) {
 // An explicit saved choice, especially disabled routing, always wins.
 if(saved)return {...saved,cellphone_number:normalizeCellphone(saved.cellphone_number)};
 const phone=normalizeCellphone(profilePhone);
 return phone?{enabled:true,cellphone_number:phone,outreach_ring_seconds:15,cellphone_ring_seconds:20}:null;
}
