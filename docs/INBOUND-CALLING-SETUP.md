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

## 5. Set the incoming destination in Admin

In **Steady Hands Admin → Phone Numbers**, each calling-number card now has
**Incoming calls go to**:

- **Outreach app** (default): rings the assigned account's signed-in browser.
- **Phone forwarding**: rings only the explicit forwarding number saved by Admin.
  Enter a valid country code; managed Twilio numbers cannot be forwarding targets.
  Press **1** on the receiving phone to answer. This prevents its voicemail from
  swallowing the call. Unanswered or unaccepted calls reach business voicemail.

Click **Save incoming destination**. Changing a destination affects the next
incoming call; active calls keep their original routing snapshot. An active,
Twilio Ready number assigned to an eligible account is required for either mode.
Profile phone numbers are never used implicitly.

The Admin destination is authoritative. The old per-user routing-enabled flag is
ignored; it cannot silently block an Admin app route. Users can still choose
**Go offline** on a particular device, which persists only for that signed-in
account on that browser. That device will not register until reconnected.

For app routes, Outreach automatically registers its incoming-only Twilio Device
after sign-in and reconnects after reload/network recovery. Microphone access is
requested when **Answer** is clicked. The incoming alert shows the caller number
and Answer/Send to voicemail controls. An optional **Enable device call alerts**
button requests OS/browser notification permission using a user gesture. Existing
Device Notifications preferences are respected. Notification clicks focus the
live receiving tab without reloading and dropping its pending call. Missed calls
appear on the call badge and in the incoming inbox (with the status callback).

Keep Outreach open, connected, and awake for immediate browser reception, or configure [PWA call notifications](PWA-CALL-NOTIFICATIONS.md) to reopen it from a device alert. A browser tab
cannot provide native carrier/CallKit reception when closed or suspended; those
calls reach voicemail. Choose Phone forwarding for an explicit telephone
endpoint when closed-app telephone reception is needed. Browser autoplay policies
can limit audible ringing; the visible call alert remains available. Notification
support varies by device/browser. Closed-app notification delivery is available through the separate server push setup in [PWA-CALL-NOTIFICATIONS.md](PWA-CALL-NOTIFICATIONS.md). Tap the push notification to reopen Outreach while the caller waits; it does not provide closed-app background audio.

Open **Incoming calls → Voicemail settings** to customize the business greeting.

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

### Forwarding between managed or external numbers

Apply `supabase/migrations/20261019000000_unassigned_phone_forwarding.sql`,
then deploy the updated `twilio-inbound` function and publish the paired Admin
forwarding update. No other function changes are required for this update.

Admin can forward an enabled, Twilio Ready number to another managed number or
an external phone. The webhook resolves managed chains internally to the final
Outreach user or external phone, without dialing a managed number back through
the PSTN. Self-forwarding, cycles, unavailable managed destinations, and routes
longer than 100 managed numbers fail without placing a call. An app destination
requires its own eligible assigned user with Outreach open; an external destination
does not require an assignment. External phones retain press-1 screening.

Calls are attributed to the eligible owner of the final managed number. When an
external route has no eligible owner, its call record has a null user_id and is
not exposed by existing own-user read policies. Voicemail uses that recipient's
saved greeting when present, otherwise the standard business greeting. Original
caller and called number are preserved. Active calls snapshot the resolved user
and external destination so routing edits affect subsequent calls.

### Existing inbound setup

1. Ensure the original inbound tables exist (section 1).
2. Run `supabase/migrations/20261018070000_admin_inbound_destinations.sql`.
   It adds per-number destination fields and per-call routing snapshots, and makes
   the legacy cellphone field optional. Existing number rows default to Outreach
   app; no profile phones or legacy cellphone fields are copied into forwarding.
   Existing RLS, table grants, and account assignments are unchanged.
3. Redeploy `twilio-inbound` and `twilio-inbound-session` with gateway JWT checks
   disabled as in section 3. Their signature/user authentication remains enabled.
4. Publish both the Admin frontend and Outreach frontend/service worker. Refresh
   Outreach so the updated receiver and service worker are active.
5. Set each purchased Twilio number's incoming POST webhook to section 4's URL.
   The TwiML App's outbound Voice Request URL is a separate setting and must remain
   pointed at `twilio-voice-outbound`.
6. Test a real incoming call to the purchased number, device notification click,
   Answer/two-way audio, decline/voicemail, and explicit Phone forwarding.

Static-site publication alone does not deploy functions or SQL. No production
SQL, secrets, number purchases, Twilio settings, or real calls were changed here.
Automated tests use mocked Twilio/browser/database APIs; production delivery and
phone/browser behavior require verification after deployment.

