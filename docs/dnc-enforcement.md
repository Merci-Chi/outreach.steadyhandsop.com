# Deploy DNC enforcement

The uploaded suppression list is in `crm_dnc_private.suppressed_phones`.
Outreach reads `public.crm`, which is separate from `public."callcenter-leads"`.
The earlier 7-row result only counted the latter table.

Deploy in this order:

1. Run all of `supabase/migrations/20261019090000_enforce_dnc_suppression.sql`
   in the project's SQL Editor. It refuses to run without the existing list.
   It backs up affected CRM records, marks matches, clears callbacks, and
   protects future imports and updates. Save the `marked_crm_leads` result.
2. From this repository, while signed into the Supabase CLI, run:

   ```sh
   npx supabase functions deploy twilio-voice-outbound --project-ref glonbvrcudwuzjundrii
   ```

   Keep `verify_jwt = false` for this webhook in `supabase/config.toml`.
   The function validates Twilio signatures itself.
3. Publish the frontend changes through the repository's normal site deployment.
   Reload existing browser/PWA sessions so they load the new checks.

The signed Twilio handler checks the actual requested destination on every call,
including calls without a CRM ID. It emits no Dial instructions if the destination
is suppressed or the check fails. Existing voice tokens cannot bypass the check.
The frontend also checks current status before opening its regular-phone links
and before starting Twilio. Phone numbers manually dialed outside Outreach are
outside this application's control. Calls already in progress are not terminated.

Before deployment, `npm test` and `npm run test:db` exercise allowed calls,
blocked numbers, error handling, number normalization, duplicate imports,
attempted DNC resets, original-record backups, and database access controls.
Do not verify by placing a real call to a DNC number; use an isolated test setup.
