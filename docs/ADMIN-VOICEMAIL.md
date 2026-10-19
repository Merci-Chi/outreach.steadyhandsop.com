
## Admin-owned voicemail greetings

Apply the Admin repository’s `sql/admin-phone-voicemail.sql` once in the shared Supabase project. The identical migration in Outreach is `supabase/migrations/20261019060000_admin_phone_voicemail.sql`; do not run both copies separately. Existing numbers get the new business default on initial installation; reruns preserve Admin edits. Old per-user Outreach greetings are no longer used.

Deploy the Admin changes, then the Outreach UI and updated `twilio-inbound` and `twilio-inbound-session` Edge Functions (Verify JWT off; both validate their own requests). The inbound function includes the 30-second PWA wait and hold music from Outreach PR #58. No new secrets are needed.

Go to **Phone Numbers** in the top navigation. Each number card has **Voicemail greeting → Save voicemail greeting**. An active ADMIN role is required in the database RPC, including if the browser role has changed. Existing phone-number RLS policies remain in place. The greeting belongs to the number the caller originally dialed, even when it forwards through another managed number. Changes apply the next time the webhook builds a voicemail greeting, without redeploying or restarting either app. Existing recordings stay in Outreach's Recent calls & voicemail inbox.

Default greeting:

> Thank you for calling Steady Hands. We are unavailable to take your call at the moment. Please try again or contact our support team at (702) 775-9756. You may also leave a message after the beep.

Callers still hear a beep and can record a message for up to two minutes. Outreach's greeting editor is removed and its legacy save endpoint returns 403. Test an unanswered app call and an unanswered forwarded call after deployment; Supabase deployment and actual Twilio audio were not performed here.
