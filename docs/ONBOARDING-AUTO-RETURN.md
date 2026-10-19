# Required actions and automatic Outreach return

Paused Outreach sessions redirect to the team onboarding portal. The original
workspace stays in Outreach session storage; the cross-origin return link carries
only the allowed page and selected CRM ID. Business/contact details and auth tokens
are not forwarded. Legacy Outreach questionnaire URLs also hand off to onboarding.

Onboarding retains the validated return link across its sign-in, questionnaire,
agreement, and main pages. It checks the authenticated server access status on
completion events, focus/visibility/online events, and every three seconds. Once all
requirements are clear it returns to the saved Outreach workspace automatically.
It does not dial a call automatically. Normal onboarding visits without an Outreach
return context do not redirect away. Failed checks never count as completed actions.

Deploy once to the shared Supabase project:

`supabase/migrations/20261019110000_automatic_requirement_completion.sql`

The same SQL is in onboarding at `sql/automatic-requirement-completion.sql`.
Run either copy once in SQL Editor. It includes the earlier missing-pause-row fix.
Triggers reconcile completion after questionnaire or individual agreement updates.
The final completion releases only `pause_action_needed`, only when no pending
questionnaires or agreements remain. Existing completed/cancelled requirements can
repair stale action-needed flags. Other pause statuses, disabled-account checks,
roles, and DNC suppression remain enforced. The reconciliation function is not
callable directly by browser clients.

Publish both repositories' frontend files after deploying the SQL. The previously
documented Edge Functions must already be deployed for server-side access and DNC
checks. A GitHub commit does not execute database migrations or deploy Edge Functions.
