# Live call transcription

The call workspace enables transcription for calls made through the app. Regular
phone calls do not pass audio through Twilio and cannot be transcribed here.

## Deploy in this order

1. Apply `supabase/migrations/20261019010000_live_transcription.sql` using the
   Supabase CLI (`supabase db push`) or SQL Editor. The existing CRM and call
   activity tables must already exist. The migration preserves their ID types
   and adds the transcript table if needed. If the transcript table already
   exists, it must have the columns used by the existing Skills/Activity pages
   (`user_id`, `crm_id`, `company`, `call_activity_id`, `segments` JSON/JSONB,
   `transcript`, `started_at`, `ended_at`, `duration_seconds`, `outcome`).
2. Deploy `twilio-transcription-webhook` with gateway JWT verification disabled
   (`supabase functions deploy twilio-transcription-webhook --no-verify-jwt`).
   The function validates the Twilio signature and account before accessing data.
3. Deploy `twilio-voice-outbound` with gateway JWT verification disabled
   (`supabase functions deploy twilio-voice-outbound --no-verify-jwt`).
4. Publish/reload the updated browser scripts through the normal GitHub Pages
   release process.

Both functions require `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, as well as the
Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. No secrets belong
in browser code. Leave `TWILIO_TRANSCRIPTION_CALLBACK_URL` unset to use
`SUPABASE_URL/functions/v1/twilio-transcription-webhook`. If set, it must match
the exact public callback URL, including any query string; the webhook uses it
for signature validation too. The TwiML App must still POST to the outbound
function configured in [MULTIPLE-CALLER-IDS.md](MULTIPLE-CALLER-IDS.md).

## Verify in production

Make a short app call to a test recipient. Speak a distinct phrase on each end.
Confirm that your microphone appears as **You**, the recipient as **Prospect**,
and suggestions respond only to the prospect. The TwiML starts transcription on
the browser parent leg, so its inbound audio is the agent microphone.

Confirm signed `transcription-started`, `transcription-content` and
`transcription-stopped` callbacks return 204 in Supabase logs. Both tracks are
transcribed using Google's telephony model. Interim hypotheses are ignored;
final utterances are saved atomically by CallSid and deduplicated by Twilio
TranscriptionSid + SequenceId. Callback failures return 500 instead of silently
losing text. Twilio provider errors appear in the live transcript feedback.

End the call and allow up to 30 seconds for late final callbacks. Open Skills to
check the saved transcript. Activity links a transcript when a matching call
activity row with the same user and CallSid is saved; this change does not
create additional activity rows. Sign in with another account and confirm that
the transcript cannot be retrieved. Repeat two calls to the same lead and check
that the second call shows only its own speech. Check a regular-phone call does
not claim to capture audio.

## Automated checks

Use Node 24: `npm ci`, `npm test`, and `npm run test:db`.
The database tests run PostgreSQL through PGlite, exercise the real migration
with UUID and bigint CRM IDs, and verify idempotency, utterance ordering,
post-stop finals, activity linking, ownership checks and RLS. Node tests cover
signed webhook validation, failures, speaker mapping, start-call parameters,
CallSid-scoped polling, stale requests, duplicate display and late final text.
GitHub Actions runs both suites. These checks do not contact Twilio or deploy
Supabase; a real call is required to confirm the production configuration.

## Incoming calls answered in Outreach

Incoming app calls now start transcription on the original incoming PSTN leg.
Deploy in this order:

1. Apply `20261019010000_live_transcription.sql` if needed. This migration now
   recreates its policy and trigger safely when rerun.
2. Apply `supabase/migrations/20261019020000_inbound_transcription.sql`.
   The inbound routing tables and Admin destination migrations must already exist.
3. Deploy these functions with gateway JWT verification disabled:

   ```sh
   supabase functions deploy twilio-transcription-webhook --no-verify-jwt
   supabase functions deploy twilio-inbound --no-verify-jwt
   supabase functions deploy twilio-inbound-session --no-verify-jwt
   ```

4. Publish the updated frontend and reload Outreach. The number's incoming URL
   stays `/functions/v1/twilio-inbound`. Keep the outbound TwiML App unchanged.

No additional secrets are required beyond the existing Account SID/Auth Token.
The transcription callback defaults to this Supabase project's
`/functions/v1/twilio-transcription-webhook`. If `TWILIO_TRANSCRIPTION_CALLBACK_URL`
is configured, it must match that deployed callback's exact public URL.

Answer a new incoming call, speak from both ends, and look in **Incoming calls →
Incoming call transcript** or the main **Transcript** area. Final utterances poll
about every three seconds, including up to 30 seconds after hangup. `You` is the
receiving agent and `Prospect` is the caller. The database reverses the outbound
callback's default speaker mapping using the saved call direction, not labels
supplied by a client. Transcript ownership is derived from the signed router's
saved call record; no browser-supplied owner or selected CRM lead is trusted.
Incoming transcripts appear in Skills as **Incoming call**, with the caller's
phone and no CRM association. Lead-specific suggestions are suppressed for this
unlinked incoming transcript rather than acting on an unrelated selected lead.

Capture starts when the app route is dialed and stops before voicemail. Phone
forwarding and voicemail-only transcripts are outside this change. A failure to
initialize transcription is logged as `Inbound transcription initialization
failed` and does not stop the call from connecting or reaching voicemail. If
text never appears, inspect that log and transcription callback invocations; valid
callbacks return 204. Provider errors appear in the transcript status. Production
Twilio speech delivery still needs a real two-way call after deployment.
