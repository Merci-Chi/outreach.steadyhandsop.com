import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed.', {status:405});
  if (!(req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) return new Response('Form data required.', {status:415});
  try {
    const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const token = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const account = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const callback = Deno.env.get('TWILIO_TRANSCRIPTION_CALLBACK_URL') || url + '/functions/v1/twilio-transcription-webhook';
    if (!url || !key || !token || !account) throw Error('Transcription configuration is missing.');
    const form = Object.fromEntries(new URLSearchParams(await req.text()));
    if (!twilio.validateRequest(token, req.headers.get('X-Twilio-Signature') || '', callback, form) || form.AccountSid !== account) return new Response('Forbidden.', {status:403});
    if (!/^CA[0-9a-f]{32}$/i.test(form.CallSid || '') || !/^GT[0-9a-f]{32}$/i.test(form.TranscriptionSid || '')) return new Response('Invalid call identifiers.', {status:400});
    const event = form.TranscriptionEvent;
    if (!['transcription-started','transcription-content','transcription-stopped','transcription-error'].includes(event)) return new Response(null, {status:204});
    let segment = null;
    if (event === 'transcription-content') {
      // Provisional text is stored separately from finalized transcript history.
      if (!['true','false'].includes(form.Final)) return new Response('Invalid final flag.', {status:400});
      let data;
      try { data = JSON.parse(form.TranscriptionData || '{}'); }
      catch { return new Response('Invalid transcription data.', {status:400}); }
      if (!String(data.transcript || '').trim()) return new Response(null, {status:204});
      if (!/^\d+$/.test(form.SequenceId || '')) return new Response('Invalid sequence.', {status:400});
      segment = {
        id: form.TranscriptionSid + ':' + form.SequenceId,
        sequence: Number(form.SequenceId),
        // Transcription starts on the browser parent leg, not its PSTN child.
        speaker: form.Track === 'inbound_track' ? 'agent' : form.Track === 'outbound_track' ? 'customer' : 'unknown',
        text: String(data.transcript).trim().slice(0, 16000), final: form.Final === 'true',
        timestamp: Number.isNaN(Date.parse(form.Timestamp)) ? null : new Date(form.Timestamp).toISOString(),
      };
    }
    const db = createClient(url, key, {auth:{persistSession:false}});
    const {error} = await db.rpc('outreach_apply_transcription', {
      p_call_sid: form.CallSid, p_event: event, p_segment: segment,
      p_error: event === 'transcription-error' ? String(form.TranscriptionError || form.ErrorMessage || form.ErrorCode || 'Transcription failed.').slice(0,1000) : null,
    });
    if (error) throw Error('Could not save transcription callback.');
    return new Response(null, {status:204});
  } catch (error) {
    console.error('Transcription callback failed:', error);
    return new Response('Transcription callback failed.', {status:500});
  }
});
