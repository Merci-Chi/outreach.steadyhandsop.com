import {createClient} from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: any, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
});
async function assignedCaller(db: any, userId: string) {
  const read = (r: any) => { if (r.error) throw Error('Could not read calling configuration.'); return r.data; };
  const deny = (message: string) => { throw Object.assign(Error(message), {status: 403}); };
  const access = read(await db.rpc('outreach_access_status', {p_user_id: userId}));
  if (typeof access?.is_paused !== 'boolean') throw Error('Could not verify account access.');
  if (access.is_paused) deny('Outreach is paused. Complete required actions and agreements, then recheck access.');
  const permission = read(await db.from('team_permissions').select('role,active,listed').eq('user_id', userId).maybeSingle());
  const profile = read(await db.from('callcenter_profiles').select('disabled_at').eq('user_id', userId).maybeSingle());
  if (!permission?.active || permission.listed === false || !['ADMIN','SALES'].includes(permission.role) || !profile || profile.disabled_at) deny('Active sales or admin access is required.');
  const assignment = read(await db.from('callcenter_phone_assignments').select('phone_number_id').eq('user_id', userId).maybeSingle());
  if (!assignment?.phone_number_id) deny('No calling number is assigned to your account.');
  const number = read(await db.from('callcenter_phone_numbers').select('phone_number,active,twilio_status').eq('id', assignment.phone_number_id).maybeSingle());
  if (number?.active !== true || number.twilio_status !== 'ready' || !/^\+[1-9]\d{7,14}$/.test(number.phone_number || '')) deny('Your assigned number must be enabled and Twilio Ready.');
  return number.phone_number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return json({error: 'Method not allowed.'}, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const account = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const apiKey = Deno.env.get('TWILIO_API_KEY_SID') || '';
    const secret = Deno.env.get('TWILIO_API_KEY_SECRET') || '';
    const app = Deno.env.get('TWILIO_TWIML_APP_SID') || '';
    if (!url || !serviceKey || !account || !apiKey || !secret || !app) throw Error('Calling secrets are not configured.');
    const db = createClient(url, serviceKey, {auth: {persistSession: false}});
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const {data, error} = await db.auth.getUser(jwt);
    if (error || !data?.user) return json({error: 'Sign in again before calling.'}, 401);
    const userId = data.user.id;
    const callerId = await assignedCaller(db, userId);
    // Preserve your existing identity format so current browser tokens also work.
    const identity = 'user_' + userId.replace(/-/g, '');
    const AccessToken = twilio.jwt.AccessToken;
    const token = new AccessToken(account, apiKey, secret, {identity, ttl: 3600});
    token.addGrant(new AccessToken.VoiceGrant({outgoingApplicationSid: app}));
    return json({token: token.toJwt(), identity, caller_id: callerId, expires_in: 3600});
  } catch (error: any) {
    console.error('Voice token failed:', error);
    return json({error: error.status === 403 ? error.message : 'Calling setup is unavailable. Check the function logs.'}, error.status === 403 ? 403 : 500);
  }
});
