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
export function voicemail(base,greeting) {
  return response(`<Say>${escapeXML(greeting||'Thank you for calling Steady Hands. Please leave your name, number, and message after the beep.')}</Say><Record maxLength="120" timeout="5" playBeep="true" action="${escapeXML(endpoint(base,'goodbye'))}" method="POST" recordingStatusCallback="${escapeXML(endpoint(base,'recorded'))}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed"/><Hangup/>`);
}
export const answered = status => status==='completed';

export function resolveRoutingSettings(saved) {
 // Twilio rings the assigned browser identity; personal numbers are never used.
 return {enabled:true,outreach_ring_seconds:20,...saved,cellphone_number:null};
}
