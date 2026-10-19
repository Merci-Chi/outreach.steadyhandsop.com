# Required actions pause Outreach

Apply `supabase/migrations/20261019070000_required_action_access.sql` in the
Supabase SQL editor after the existing questionnaire migrations, before deploying
the JavaScript. The migration is idempotent. It does not run automatically from
GitHub and this change does not modify the live database.

Deploy these updated Edge Functions as well:

```
supabase functions deploy twilio-voice-token
supabase functions deploy twilio-voice-outbound
supabase functions deploy twilio-inbound-session
supabase functions deploy twilio-inbound
```

The shared `outreach_access_status` RPC checks the authenticated user's pending
assignments and the existing `sh_get_my_access_pause()` agreement/account check.
Either requirement blocks access. It does not create a stored pause that an
administrator must later reset. All assigned questionnaires must be completed
or cancelled; completing just one of several does not unlock access. An unrelated
account/agreement pause is preserved until its own requirement clears.

Questionnaire pages remain accessible during a pause. Submission triggers an
immediate fresh check; once the final requirement clears, the app automatically
returns to Outreach. Assignment changes also broadcast an invalidation signal
through Supabase Realtime. Another tab rechecks on focus, visibility, storage
signals, and every five seconds as a fallback. The pause and Action Needed pages
include a Recheck access button. Network errors never unlock access.

Agreement completion in an external portal is observed on return/focus or the
next five-second fallback check. Its database tables and completion handler are
not in this repository, so this change cannot add a completion event there.
`sh_get_my_access_pause()` must report current requirements correctly. If it
returns a persisted/manual pause after an agreement is completed, its upstream
implementation must be corrected; this migration deliberately does not clear
an unknown account restriction. To inspect that implementation in SQL Editor:

```sql
select pg_get_functiondef('public.sh_get_my_access_pause()'::regprocedure);
```

Restrictive RLS policies on CRM, call activity, transcripts and queues intersect
existing policies without granting access. Questionnaire/admin configuration
permissions are unchanged. Service-only webhook calls can check their verified
user identity through the same RPC; browser callers cannot check another user.
Token issuance and every outbound call recheck access, including existing-token
calls. Incoming app calls for paused owners go to voicemail. An already
connected call is not forcibly terminated by this change.

Verification: `npm test` and `npm run test:db`. The access tests include live
PostgreSQL execution via PGlite, multiple pending actions, independent agreement
requirements, cancellation, owner-only access, RLS, fresh unpause reads, direct
workspace routes, Realtime invalidation, network failure, and calling revocation.
