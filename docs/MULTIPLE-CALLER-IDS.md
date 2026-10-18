# Caller IDs from Admin assignments

Replace both Edge Functions with the self-contained entrypoints in this repository.
Keep the existing Twilio Account SID, API key SID/secret, and TwiML App SID. The
outbound function also requires that account's TWILIO_AUTH_TOKEN for webhook
signature validation. Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

Set TWILIO_OUTBOUND_WEBHOOK_URL to the exact TwiML App Voice Request URL:

https://glonbvrcudwuzjundrii.supabase.co/functions/v1/twilio-voice-outbound

Configure the TwiML App to POST to that URL. Keep JWT verification ON for
`twilio-voice-token`. Turn gateway JWT verification OFF for `twilio-voice-outbound`;
Twilio has no Supabase JWT, so this endpoint verifies its signature and account.
Do not disable signature checks if the URL or account configuration is wrong.

The token verifies the user using Supabase Auth and preserves the existing
`user_` plus hyphenless UUID identity. The signed outbound webhook reconstructs
that UUID from Twilio's From identity and rechecks active role, profile, and
current approved number assignment on every call. A client-supplied agent_user_id
or callerId is ignored. TWILIO_CALLER_ID is no longer read. No SQL is needed.

This supports multiple numbers across accounts, with one current default per user
as represented by Admin. Reassigning that default affects the next outbound call,
even if an existing browser token is reused. An unassigned or revoked account
cannot fall back to the global number. Twilio must also permit the selected number
on the configured account. Inbound reception requires a Voice-capable number
owned/ported into that Twilio account; a Verified Caller ID alone does not receive
incoming calls through Twilio.

After deploying, reload Outreach. Make a new test call for each of two accounts
and inspect the actual outbound PSTN leg's From value in Twilio. Confirm that
changing an assignment takes effect on a new call. Tests mock the Twilio SDK and
database; no production deployment or real calls were performed here.
