# Incoming calls while the PWA is closed

Incoming calls can send a Web Push notification to each enabled device. The
caller waits up to 60 seconds for an eligible browser to register. Tap the
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
Expired endpoints (HTTP 404/410) are pruned. Push TTL is 60 seconds and the worker
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
