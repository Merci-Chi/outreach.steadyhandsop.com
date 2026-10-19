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
export function phoneDial(base,call,settings={}) {
 return response(`<Dial answerOnBridge="true" timeout="25" callerId="${escapeXML(call.to_number)}" action="${escapeXML(endpoint(base,'phone-ended'))}" method="POST"><Number url="${escapeXML(endpoint(base,'screen',call.call_sid))}" method="POST">${escapeXML(call.forward_number)}</Number></Dial>`);
}
export function screen(base,parent) {
 return response(`<Gather numDigits="1" timeout="7" action="${escapeXML(endpoint(base,'accept-cell',parent))}" method="POST"><Say>Incoming Steady Hands call. Press 1 to answer.</Say></Gather><Hangup/>`);
}
export function voicemail(base,greeting) {
  return response(`<Say>${escapeXML(greeting||'Thank you for calling Steady Hands. We are unavailable to take your call at the moment. Please try again or contact our support team at (702) 775-9756. You may also leave a message after the beep.')}</Say><Record maxLength="120" timeout="5" playBeep="true" action="${escapeXML(endpoint(base,'goodbye'))}" method="POST" recordingStatusCallback="${escapeXML(endpoint(base,'recorded'))}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/><Hangup/>`);
}
export const answered = status => status==='completed';

export function resolveRoutingSettings(saved) {
 // Admin number routing is authoritative; legacy per-user toggles do not block it.
 return {outreach_ring_seconds:20,...saved,enabled:true,cellphone_number:null};
}


// Follow managed routes within this webhook; never dial back into another
// managed webhook leg. This avoids repeated screening and PSTN forwarding loops.
export async function resolveForwardRoute(number, loadNumber) {
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
