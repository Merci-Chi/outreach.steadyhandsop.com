# Outreach → cellphone → business voicemail

The code is prepared but Twilio and Supabase must be configured before calls can reach it. Keep the existing outbound `twilio-voice-token` and TwiML App unchanged: incoming reception uses a separate token and browser Device.

## 1. Apply the SQL

In the Supabase project's SQL Editor, run the complete contents of:

`supabase/migrations/20261017010000_inbound_callbacks.sql`

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

Alternatively deploy each folder using your Supabase deployment workflow, including `twilio-inbound/routing.mjs`, which is shared by both functions. The repository's `supabase/config.toml` disables the gateway JWT check for these two functions only. This is necessary for Twilio webhooks and modern publishable keys. The functions still authenticate every request themselves: `twilio-inbound` validates the Twilio signature and Account SID; `twilio-inbound-session` verifies the user's JWT and current active role.

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

## 5. Set your cellphone and greeting

Open Outreach, sign in, and click **Incoming calls** (lower right).

1. Open **Cellphone & voicemail settings**.
2. Enter your real cellphone with country code, for example `+17025550101`. Do not enter a Twilio business number; the server rejects managed numbers to avoid forwarding loops.
3. Check **Enable Outreach → cellphone → voicemail**.
4. Enter the business voicemail greeting and click **Save routing settings**.
5. Click **Enable on this device** and allow microphone access.
6. Confirm the status says **Ready for incoming calls**.

The browser rings for a configured 15 seconds, then your cellphone for 20 seconds. Twilio may add a roughly five-second dial timeout buffer. On your cellphone press **1** to accept the call. An automatic cellphone voicemail greeting cannot press 1, so the original caller continues to business voicemail. The caller can leave up to 120 seconds of audio.

The browser must remain open and connected. Reception must be enabled again after navigating/reloading to establish browser audio permissions. A closed, offline, or busy browser falls through to the cellphone. Mobile browsers, especially in the background, may suspend; the cellphone fallback is the reliable path in that situation.

Saving routing as disabled sends incoming calls directly to the business voicemail; going offline on this device leaves cellphone fallback enabled. This does not change the number's outbound approval.

## 6. Test with two phones

Use a second phone as the caller, separate from your forwarding cellphone:

- **Outreach answers:** Call the business number, answer in Outreach, verify two-way audio, and hang up. The cellphone must not ring after a successful browser conversation.
- **Cellphone answers:** Go offline in Outreach or decline the incoming popup. The cellphone should ring. Press 1, verify two-way audio, and hang up. Business voicemail must not play after a completed call.
- **Voicemail:** Leave both unanswered, including allowing the cellphone's own voicemail to pick up. The caller should hear the business greeting and beep. Leave a message and hang up. Refresh Incoming calls and play the recording.
- **Busy browser:** During an outbound Outreach call, have the other phone call back. The inbound call should fall through to the cellphone; it must not interrupt the outbound conversation.
- **Assignment:** A second agent must not see your calls or play your voicemail.

Real calls incur Twilio usage charges. Trial accounts require verified test numbers and impose calling limits; use an upgraded account for public callbacks.

## Troubleshooting

- **Setup unavailable:** Confirm the SQL and both Edge Functions were deployed to this same project.
- **403 on the webhook:** Confirm `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, and the exact public webhook URL. Twilio signs the URL including its query string; an unexpected slash, redirect, or proxy URL will fail validation. Do not disable signature validation.
- **Browser does not ring:** Confirm an enabled Twilio Ready assignment, enabled routing settings, a successful incoming-only token, and Ready status on the current page.
- **Cellphone does not ring:** Confirm its country code and Twilio Voice geographic permissions; inspect Twilio's call logs.
- **Recording not ready:** Wait for Twilio's completed recording callback and refresh. Audio is retrieved server-side with Twilio authentication and is returned only to the assigned user. Recordings remain stored in your Twilio account; manage retention there.

No production secrets were installed, SQL executed, Twilio settings changed, or real calls placed by this implementation.
