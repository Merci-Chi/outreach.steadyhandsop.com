# Assigned Action Needed questionnaires

## Deploy the database first

Run `supabase/migrations/20261018190000_assigned_action_questionnaires.sql` in
project `glonbvrcudwuzjundrii` before assigning anyone. It can run with or without
the earlier standalone questionnaire SQL. It reuses `team_permissions` with
`role = 'ADMIN'` and `active = true`; the earlier `outreach_admins` table is
not used for authorization. Existing profile and CRM records are not modified.
No users, associate records, or assignments are automatically created/imported.
The migration is not executed by this GitHub change.

The public project URL and publishable key already used in `auth-guard.js`
provide the shared `steadyHandsCRMClient`. No additional keys, token storage,
or login system were added. The existing access-pause and onboarding checks
remain in effect through `auth-guard.js` on every new page.

## Entry points

- `action-needed.html`: assignment list, empty state, and completed state.
- `alreadyoncommission.html`: assigned commission associates only.
- `currentlyonhourlywage.html`: assigned hourly associates only.
- `actions/css.css`, `actions/js.js`, `actions/start-dates.js`: questionnaire.
- `action-needed-api.js`: authenticated Supabase adapter.

Action Needed is linked from the Outreach header and shared sidebar. Direct
URLs still check the authenticated user's assignment and correct current
agreement. Assignments cannot be created or changed by an associate.

## Future Admin page contract

The admin interface is deliberately not added in this change. A signed-in
active ADMIN can later call:

```js
const {data: assignmentId, error} = await client.rpc('outreach_admin_assign_action', {
  p_user_id: selectedUserId,
  p_current_basis: 'hourly', // Actual current agreement: 'hourly' or 'commission'.
  p_start_date: '2026-10-26' // Actual scheduled Monday-Friday date; nullable for commission.
});
```

Supply the actual values from the selected associate. Do not infer an agreement
or start date from browser state. The RPC creates/updates the associate record
and assigns `weekly_readiness` to that one user. Reassignment rotates its ID,
invalidating stale browser tabs. Earlier preferences remain as the last submitted
response until the new assignment is completed; the UI never treats them as
completion of a newly assigned action. Start-date changes remain in history.

To withdraw an action:

```js
await client.rpc('outreach_admin_cancel_action', {p_user_id: selectedUserId});
```

These functions reject non-admin callers. SQL Editor calls do not carry the
admin's browser JWT; use a signed-in admin client for these RPCs. For one-off
SQL Editor provisioning before the Admin UI exists, use an explicit transaction:

```sql
-- Replace all sample values. The UUID must exist in auth.users.
begin;
select pg_advisory_xact_lock(hashtextextended('ASSOCIATE_AUTH_UUID', 0));
insert into public.outreach_associates(user_id, current_basis, start_date)
values ('ASSOCIATE_AUTH_UUID'::uuid, 'hourly', date '2026-10-26')
on conflict (user_id) do update
set current_basis = excluded.current_basis,
    start_date = excluded.start_date, updated_at = now();
insert into public.outreach_action_assignments(user_id)
values ('ASSOCIATE_AUTH_UUID'::uuid)
on conflict (user_id) do update
set id = gen_random_uuid(), status = 'assigned',
    assigned_at = now(), assigned_by = null, completed_at = null;
commit;
```

Admin read access is available on `outreach_associates`,
`outreach_action_assignments`, `outreach_action_preferences`, and
`outreach_start_date_history`. Join by `user_id` to the existing profile table
for display names. Add the actual management UI in a later change.

## Associate writes

`outreach_action_extend_start_date` checks assignment ID, owner, active status,
current hourly agreement, expected previous date, later dates only, Monday-Friday,
and the four-calendar-month horizon. Start-date rules and picker use Pacific
business dates, independently of the user's display timezone. The change is
saved and audited when the user explicitly confirms the new date. Leaving the
questionnaire afterward does not undo that confirmed start-date change.

`outreach_action_submit` validates the full response and marks the assignment
completed in one transaction. Hourly requires quota acknowledgment and an exact
match to the current scheduled start date. Hourly-to-commission selection sets
`commission_agreement_requested = true`; it does not change `current_basis`
or issue/sign an agreement. Commission-to-hourly requires administrator action.
Responses use IANA timezone names; stored shift start is minutes after midnight
in work_timezone, with a fixed 120-minute duration. Weekly hours are separate.

Browser roles have SELECT only on these tables; writes use the explicit RPCs.
The prior standalone write RPCs are revoked from browser roles to prevent an
assignment bypass. Admin cancellation, reassignment, and associate writes share
a per-user transaction lock. Account identity always comes from Supabase Auth.
SQL owners/service-role processes remain trusted administrative writers.

## Verification

Run `node --test tests/action-needed.test.mjs` for questionnaire, picker, and
adapter behavior. Run the database checks in
`supabase/tests/assigned_actions.test.sql` against a local Supabase test database
with `supabase test db`. These checks exercise access policies and RPCs with
separate admin/associate JWT identities. They are rolled back after testing.
Live deployment still needs the migration applied and a real assigned-user check.

## US calling number question

The final questionnaire step requires one of: needs a US number, already has
a US number, or has Google Voice. The last two require a valid 10-digit
US-format number (or +1). Phone answers are stored as phone_setup and
us_phone_number on outreach_action_preferences. Numbers are normalized to +1.
This is format validation, not proof of number ownership or a phone provisioning
request sent to an external provider. Needs-number requests are visible in
Other Actions, including a filter for administrator follow-up.

After the base assigned-action migration, apply the additional phone migration:
`supabase/migrations/20261018210000_questionnaire_phone_setup.sql`.
Existing answers remain readable. The new protected submission RPC requires
a phone choice for new responses and saves it atomically with completion.
The earlier submission RPC is revoked from browser callers, so open older
questionnaire tabs must reload. No live migration is executed by this commit.
