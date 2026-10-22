import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';

const xmlEscape = (value: string) => String(value || '').replace(/[&<>"']/g,
  c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
const xml = (inner: string, status = 200) => new Response(
  '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + '</Response>',
  {status, headers: {'Content-Type':'text/xml; charset=utf-8', 'Cache-Control':'no-store'}},
);
function normalizeE164(value: string) {
  const raw = String(value || '').trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '';
}
async function assignedCaller(db: any, userId: string) {
  const read = (r: any) => { if (r.error) throw Error('Could not read calling configuration.'); return r.data; };
  const deny = (message: string) => { throw Object.assign(Error(message), {status: 403}); };
  const access = read(await db.rpc('outreach_access_status', {p_user_id: userId}));
  if (typeof access?.is_paused !== 'boolean') throw Error('Could not verify account access.');
  if (access.is_paused) deny('Outreach is paused. Complete required actions and agreements, then recheck access.');
  const permission = read(await db.from('team_permissions').select('role,active,listed,sales_enabled').eq('user_id', userId).maybeSingle());
  const profile = read(await db.from('callcenter_profiles').select('disabled_at').eq('user_id', userId).maybeSingle());
  if (!permission?.active || permission.listed === false || !(['ADMIN','SALES'].includes(permission.role) || permission.sales_enabled === true) || !profile || profile.disabled_at) deny('Active sales or admin access is required.');
  const assignment = read(await db.from('callcenter_phone_assignments').select('phone_number_id').eq('user_id', userId).maybeSingle());
  if (!assignment?.phone_number_id) deny('No calling number is assigned to your account.');
  const number = read(await db.from('callcenter_phone_numbers').select('phone_number,active,twilio_status').eq('id', assignment.phone_number_id).maybeSingle());
  if (number?.active !== true || number.twilio_status !== 'ready' || !/^\+[1-9]\d{7,14}$/.test(number.phone_number || '')) deny('Your assigned number must be enabled and Twilio Ready.');
  return number.phone_number;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed.', {status:405});
  try {
    const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const account = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const webhook = Deno.env.get('TWILIO_OUTBOUND_WEBHOOK_URL') || url + '/functions/v1/twilio-voice-outbound';
    if (!url || !serviceKey || !account || !authToken) throw Error('Calling secrets are not configured.');
    if (!(req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) return new Response('Form data required.', {status:415});
    const params = Object.fromEntries(new URLSearchParams(await req.text()));
    if (!twilio.validateRequest(authToken, req.headers.get('X-Twilio-Signature') || '', webhook, params) || params.AccountSid !== account) return new Response('Forbidden.', {status:403});
    // From is supplied by Twilio using the Voice token identity. Ignore agent_user_id
    // and any caller ID supplied as custom parameters by the browser.
    const match = /^client:user_([0-9a-f]{32})$/i.exec(params.From || '');
    if (!match) return new Response('Unknown browser identity.', {status:403});
    const hex = match[1].toLowerCase();
    const userId = [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
    const db = createClient(url, serviceKey, {auth:{persistSession:false}});
    const callerId = await assignedCaller(db, userId); // Re-read on every call.
    // Enforce calling policies independently of the browser (fail closed).
    const {data: policy, error: policyError} = await db.from('associate_calling_policies')
      .select('mode,ready_after').eq('user_id',userId).maybeSingle();
    if(policyError) throw Error('Could not verify calling policy.');
    if(policy?.mode==='restricted') return xml('<Say>Your calling access is temporarily paused. Please contact your team administrator for help.</Say><Hangup/>');
    if(policy?.mode==='delayed' && (!policy.ready_after || Date.now()<new Date(policy.ready_after).getTime()))
      return xml('<Say>Call preparation has not finished.</Say><Hangup/>');
    if(policy?.mode==='delayed'){
      // Consume the preparation window; the next outbound call needs a new delay.
      const {data:consumed, error:consumeError}=await db.from('associate_calling_policies')
        .update({ready_after:null}).eq('user_id',userId).eq('ready_after',policy.ready_after)
        .select('user_id');
      if(consumeError || consumed?.length!==1) throw Error('Call preparation has already been used.');
    }
    const destination = normalizeE164(params.To || params.to || '');
    if (!/^\+[1-9]\d{7,14}$/.test(destination)) return xml('<Say>The destination number is invalid.</Say><Hangup/>');
    const transcribe = /^(1|true|yes)$/i.test(params.transcribe || '');
    const crmId = String(params.crm_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,80);
    // Always check the signed destination, even without a CRM ID or with a forged ID.
    // A failed/missing migration must never fall through to Dial.
    const {data: blocked, error: dncError} = await db.rpc('outreach_call_is_blocked', {
      p_phone: destination, p_crm_id: crmId || null,
    });
    if (dncError || typeof blocked !== 'boolean') throw Error('Could not verify Do Not Call status.');
    if (blocked) return xml('<Say>This number is marked Do Not Call. Calling is blocked.</Say><Hangup/>');
    const callback = Deno.env.get('TWILIO_TRANSCRIPTION_CALLBACK_URL') || url + '/functions/v1/twilio-transcription-webhook';
    if (transcribe) {
      const {error} = await db.rpc('outreach_start_transcript', {
        p_call_sid: params.CallSid, p_user_id: userId, p_crm_id: crmId,
      });
      if (error) throw Error('Could not initialize the call transcript.');
    }
    // This TwiML runs on the browser parent leg: inbound is the agent microphone.
    const transcription = transcribe ? '<Start><Transcription statusCallbackUrl="' + xmlEscape(callback) + '" track="both_tracks" inboundTrackLabel="agent" outboundTrackLabel="customer" languageCode="en-US" partialResults="true" enableAutomaticPunctuation="true" transcriptionEngine="google"' + (crmId ? ' name="' + xmlEscape('crm_' + crmId) + '"' : '') + '/></Start>' : '';
    return xml(transcription + '<Dial answerOnBridge="true" callerId="' + xmlEscape(callerId) + '"><Number>' + xmlEscape(destination) + '</Number></Dial>');
  } catch (error: any) {
    console.error('Outbound call failed:', error);
    return xml('<Say>' + xmlEscape(error.status === 403 ? error.message : 'The call could not be started.') + '</Say><Hangup/>', error.status === 403 ? 200 : 500);
  }
});
