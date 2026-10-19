# Incoming calls while the PWA is closed

Incoming calls can send a Web Push notification to each enabled device. The
caller waits up to 30 seconds for an eligible browser to register. Tap the
notification to open/focus Outreach, then use Answer and grant microphone access.
If no device answers in time, the caller reaches the existing business voicemail.
A registered browser receives the call directly; a failed offline dial returns
to the bounded waiting flow until a fresh browser heartbeat is available. A
browser that actually received and declined/ignored the invite goes to voicemail.
Phone-forwarded routes keep their existing behavior.

This is notification → reopen → answer. A closed PWA cannot run the Twilio browser
phone or answer audio on the lock screen. Device connectivity, browser support,
notification settings, Focus/Do Not Disturb, force-stop restrictions and push
service delivery affect availability. It is not a native CallKit/Android call UI.

## Deploy

1. Apply `supabase/migrations/20261019040000_pwa_call_push.sql` after the existing
   inbound calling migrations. It creates protected subscription/device tables
   and adds waiting/attempt/alert timestamps to incoming records. It is rerunnable
   and does not change existing incoming call ownership or forwarding.
2. Generate a VAPID pair on your own computer:

   ```sh
   npx --yes web-push@3.6.7 generate-vapid-keys --json
   ```

   In Supabase → Edge Functions → Secrets, set:

   - `WEB_PUSH_VAPID_PUBLIC_KEY`: generated `publicKey`.
   - `WEB_PUSH_VAPID_PRIVATE_KEY`: matching generated `privateKey`.
   - `WEB_PUSH_VAPID_SUBJECT`: a real administrator contact, e.g.
     `mailto:admin@your-domain.com`.

   Keep the private key in Supabase, not GitHub or browser code. Retain the pair
   across deployments. The public key is returned to signed-in users by the
   session function. Incoming-call push uses a separate service worker scope
   (`/call-push/`) so these keys do not replace scheduled-reminder subscriptions.
3. Deploy both updated self-contained Edge Functions:

   ```sh
   supabase functions deploy twilio-inbound --no-verify-jwt
   supabase functions deploy twilio-inbound-session --no-verify-jwt
   ```

   Gateway Verify JWT must be off; the functions retain their own Twilio-signature
   and signed-in-user authentication. The inbound function imports
   `npm:web-push@3.6.7` to encrypt/send notifications. Existing Twilio and Supabase
   secrets and the incoming webhook URL remain unchanged.
4. Publish the frontend, including `call-push-sw.js`, `sw.js`, and the updated
   inbound module/sidebar. Reload Outreach. Register alerts once per device using
   Incoming calls → Enable device call alerts.

A missing push configuration keeps existing open-app reception working. Push
registration reports missing keys rather than claiming closed-app alerts are
ready. Phone numbers must still be enabled, Twilio Ready and assigned to an
eligible signed-in agent/admin using the Outreach app destination.

## Enable each device

- **iPhone/iPad:** add Outreach to the Home Screen using the browser's Share menu,
  launch that installed app, sign in, and tap Enable device call alerts. Allow
  notifications in the system prompt. Web Push requires iOS/iPadOS 16.4 or later.
- **Android:** use a browser supporting Web Push; installing Outreach is
  recommended. Sign in and enable device call alerts. Allow browser/app
  notifications in device settings.
- **Desktop:** open or install Outreach in a Web Push supporting browser, sign in,
  and enable device call alerts. Allow site and browser notifications in OS
  settings. Background delivery when the whole browser is quit depends on the
  browser and OS; closing the app window is different from force-stopping it.

Each endpoint belongs to the authenticated account and is enrolled separately.
Turn off device call alerts disables that device's incoming push subscription.
Go offline also disables its push alerts; Connect incoming calls brings browser
reception back, and the alerts button re-enables closed-app push. Signing out
unsubscribes the dedicated incoming-call push endpoint on that browser.

The payload is generic and does not include caller phone numbers or CRM details.
The incoming handler only sends to enabled subscriptions belonging to the resolved
route owner. The subscription API restricts endpoints to supported Apple, Google,
Mozilla and Windows push services, and never accepts browser-supplied ownership.
Expired endpoints (HTTP 404/410) are pruned. Push TTL is 30 seconds and the worker
discards expired alerts. Clicking a notification focuses an existing same-origin
window without navigation, preserving pending/active calls; otherwise it opens
`/index.html?incoming=<CallSid>`. The URL does not authorize access to the call.

## Verify on real devices

1. Enable alerts and confirm “Closed-app call alerts enabled on this device.”
2. Close Outreach, then call the business number from a different phone. Expect a
   generic device notification and a brief hold announcement to the caller.
3. Tap the notification, wait for the incoming alert, and tap Answer. Verify
   two-way audio, transcription, and that other registered devices stop ringing.
4. Ignore another call; verify business voicemail after the waiting deadline.
5. Repeat for each platform, disabled notification permission, Go offline, device
   sign-out and loss of connectivity. Verify scheduled reminders still work.

Look for `Incoming push setup failed`, `Incoming push delivery failed`, or
`Incoming readiness failed` in inbound function logs. The sender uses background
`EdgeRuntime.waitUntil`, high urgency, a short TTL and a four-second send timeout.
Existing foreground alerts and voicemail remain available if push fails.
Automated tests mock browser/push/Twilio delivery and exercise the SQL migration
locally; they do not establish actual APNs/FCM/browser delivery or microphone
behavior. A real call after deployment is necessary on each target platform.

## Automatic updates and missing-alert diagnostics

After deploying the PWA push setup above, apply
`supabase/migrations/20261019050000_push_delivery_status.sql`, then redeploy
`twilio-inbound` and `twilio-inbound-session` with gateway Verify JWT off and
publish the updated frontend. No new secrets are needed for this follow-up.

The app automatically attempts incoming push enrollment when device permission
is already granted, unless the user explicitly disabled alerts or went offline.
Incomplete setup reports its error and retries without requesting permission
again. The existing foreground notification remains available unless this device
already has the matching server alert. Enrollment alone no longer suppresses it.

Use **Incoming calls → Test device call alerts** to explicitly send a test to
this device's enrolled endpoint. The result distinguishes missing server keys,
expired subscriptions and provider rejection. An accepted push request is not
proof that the OS displayed it: also check device/browser notification and Focus
settings. The UI shows the last server delivery error when present. Actual call
sends record attempt/success/error metadata in the protected subscription table;
no secret key is returned to the browser. A 404/410 test result disables the
expired endpoint so enrollment can replace it.

Once this updater version is loaded, it checks deployment headers every minute
and on return to the app/network. GitHub Pages ETag and Last-Modified headers
identify a new published page, including deployments retaining script URLs. It
automatically refreshes a visible idle page, deferring while a browser/regular
phone call, incoming invite, transcript drain, editable focus or unsaved input
is active. Initial service-worker installation does not trigger a reload loop.
Returning to the app leaves a 15-second grace period for pending calls to arrive.
Successful forms can signal `steadyhands:changes-saved` with `{form}`; a form
submission alone does not prove a save succeeded. Removing/resetting a draft
also releases the update hold. Voicemail settings emit the success event.
One initial page refresh/navigation may be needed to load this updater in an
already-open older PWA; no app uninstall or OS restart is required. The deployed
Supabase functions/SQL still require deployment; browser updates do not deploy
backend code or secrets.

## Shorter hold with music

Redeploy the latest `twilio-inbound` function to use a 30-second connection window
and the announcement “Please hold while we connect your call.” A short original
instrumental arpeggio plays while waiting for the PWA, with readiness checked
between two-second segments. The final fraction of the window uses a brief
pause instead of starting another segment. Webhook/audio retrieval and speech
playback can add a small amount of timing overhead; this is approximately a
30-second window, not a frame-accurate limit. Once a browser is ready it rings
for at most 20 seconds, capped by time remaining in the window.

Audio is served by the same function's public GET `?stage=hold-music` endpoint
as a cacheable 8 kHz mono PCM16 WAV. It returns fixed synthesized audio without
reading any call/account data. Other GET requests remain rejected; signed POST
validation for routing is unchanged. There is no music-file upload, SQL migration,
new secret, external audio host, or frontend change for this update. The voicemail
greeting remains editable in Outreach. Test a closed-PWA call after deployment
and verify music, notification-click answer, and voicemail on timeout.
