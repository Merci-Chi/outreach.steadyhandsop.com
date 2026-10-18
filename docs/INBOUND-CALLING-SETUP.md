# Twilio number → Outreach → business voicemail

The code is prepared but Twilio and Supabase must be configured before calls can reach it. Keep the existing outbound `twilio-voice-token` and TwiML App unchanged: incoming reception uses a separate token and browser Device.

## 1. Apply the SQL

In the Supabase project's SQL Editor, run the complete contents of:

`supabase/migrations/20261017010000_inbound_callbacks.sql`

Then run `supabase/migrations/20261018060000_twilio_only_inbound.sql`.
The second migration makes the legacy cellphone field optional. Run it before
deploying the updated session function so voicemail settings can save without a
personal number. It preserves existing settings and call history.

It creates the per-user routing settings and private incoming-call/voicemail records. Authenticated users may read only their own records. All writes are performed by the protected Edge Functions. Re-running the migration preserves records.

## 2. Configure server secrets

In Supabase → Edge Functions → Secrets, configure:

- `TWILIO_ACCOUNT_SID`: the account that owns the assigned Twilio numbers.
- `TWILIO_AUTH_TOKEN`: that account's auth token, used to validate Twilio webhooks and retrieve recordings.
- `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`: a Twilio API key belonging to the same account, used only to issue incoming-only browser tokens. Use the key SID, not the account SID, in the API key field.
- `TWILIO_INBOUND_WEBHOOK_URL`: `https://glonbvrcudwuzjundrii.supabase.co/functions/v1/twilio-inbound` (exactly, without a trailing slash or query string).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied automatically to deployed Supabase functions. Never add secrets to GitHub, browser files, or chat.

If deploying to another Supabase project, substitute its project URL for the URL above and ensure the app uses that project too.

## 3. Deploy both Edge Functions

From an authenticated Supabase CLI checkout linked to the correct project:

```sh
supabase functions deploy twilio-inbound --no-verify-jwt
supabase functions deploy twilio-inbound-session --no-verify-jwt
```

Alternatively, in Supabase → Edge Functions → Deploy a new function → Via Editor, paste the matching `index.ts` for each function. Both function entrypoints are self-contained; the editor does not need any shared local imports. The repository's `supabase/config.toml` disables the gateway JWT check for these two functions only. This is necessary for Twilio webhooks and modern publishable keys. The functions still authenticate every request themselves: `twilio-inbound` validates the Twilio signature and Account SID; `twilio-inbound-session` verifies the user's JWT and current active role.

## 4. Set the Twilio number's incoming webhook

Twilio Console → Phone Numbers → Manage → Active Numbers → select your business number.

Preserve its previous incoming settings before changing them. In Voice Configuration set:

- **A call comes in:** Webhook
- **URL:** `https://glonbvrcudwuzjundrii.supabase.co/functions/v1/twilio-inbound`
- **Method:** HTTP POST

If the number settings expose a call status callback, use the following, also POST:

`https://glonbvrcudwuzjundrii.supabase.co/functions/v1/twilio-inbound?stage=status`

The status callback lets the inbox mark calls as missed when the caller hangs up early. Without it, voicemail and answered-call records work, but early abandoned calls may retain a ringing/forwarding status. Do not point the outbound TwiML App's Voice URL at this incoming webhook.

In Steady Hands Admin, keep the same number enabled, **Twilio Ready**, and assigned to the intended agent/admin. Incoming routing reads that assignment from the database; it never accepts a user ID supplied by the caller.

For recording privacy, confirm **Voice → General Settings → Enforce HTTP Auth on Media URLs** is enabled if your Twilio account exposes that legacy setting. Playback in Outreach retrieves the audio through an authenticated server endpoint rather than exposing a recording URL.

## 5. Receive calls using only the assigned Twilio number

The assigned business number is sufficient. Personal/profile cellphone numbers
are ignored, including legacy forwarding settings. No cellphone number is
collected by the incoming-call settings form.

1. Open Outreach, sign in, and click **Incoming calls**.
2. Open **Voicemail settings**.
3. Leave **Enable incoming calls in Outreach** checked and save your business
   voicemail greeting. Existing explicit disabled settings remain disabled until
   you enable them. Users without saved settings can receive calls by default.
4. Click **Enable on this device**, allow microphone access, and confirm
   **Ready for incoming calls** shows the assigned Twilio number.
5. Keep Outreach open and connected. Calls ring in the browser. Unanswered,
   declined, offline, and busy calls go directly to business voicemail.

A successful browser call ends without starting voicemail. No call is forwarded
to a salesperson's personal phone. Reception must be enabled again after
navigation/reload to establish browser audio permissions. Browsers can suspend
in the background, especially on mobile; in that case calls go to voicemail.

## 6. Provision a new Twilio number

1. In the same Twilio account as the configured Account SID and API key, open
   **Phone Numbers → Manage → Buy a number**.
2. Search United States local numbers, area code **702** or **725**, with
   **Voice** capability. Review the selected number's recurring price before
   purchase. Availability and account pricing must be checked in the console.
3. Set the incoming Voice webhook and optional status callback from section 4.
   Preserve the working outbound TwiML App configuration.
4. In Steady Hands Admin → Phone Numbers, add the purchased number in E.164
   format, enable it, mark it **Twilio Ready**, and assign it to the intended
   agent/admin. Browser tokens and routing use this assignment.
5. Test outbound caller ID and inbound reception from a separate phone.

Both the browser token and the number must belong to the same Twilio account.
Buying a number alone does not configure its webhook or CRM assignment. A trial
account may require an upgrade or verified test destinations before public use.

## 7. Verify reception and voicemail

- Call the purchased business number from a separate phone and answer in
  Outreach. Verify audio in both directions and hang up.
- Decline or leave a call unanswered. Verify the business greeting and recording.
- Go offline or close Outreach. Verify the caller reaches voicemail and that no
  personal number rings.
- While an outbound call is active, call the number from another phone. The
  incoming call must reach voicemail without interrupting the outbound call.
- Verify another agent cannot view these calls or play the recordings.

## Troubleshooting

- **Setup unavailable:** apply both SQL migrations and deploy both incoming
  functions to this Supabase project.
- **403 on webhook:** verify Account SID, auth token, and the exact public URL.
  Keep signature validation enabled.
- **Browser not ringing:** confirm Voice capability, the number's HTTP POST
  webhook, active/Twilio Ready CRM assignment, enabled routing, and Ready status
  on the current Outreach page.
- **Cannot save voicemail settings:** apply the Twilio-only migration before
  deploying the updated session function.
- **Recordings not ready:** wait for the recording callback and refresh. Audio
  is retrieved server-side and is accessible only to the assigned user.

## Deployment

After merging, apply the new nullable-field migration and redeploy both
`twilio-inbound` and `twilio-inbound-session` using the commands in section 3.
Static-site publication alone does not deploy Edge Functions. Existing server
secrets and the incoming webhook remain required. No production SQL, secrets,
number purchases, Twilio settings, or real calls were changed by this code PR.
