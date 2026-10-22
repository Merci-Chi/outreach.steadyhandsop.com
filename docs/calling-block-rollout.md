# Calling and lead access block

Apply `sql/blocked-calling-access.sql` to the shared Supabase project before deploying either frontend. The production migration is pending approval and has not been applied.

The existing `restricted` calling policy becomes a block on calling and lead access. The access-status RPC reports `calling_blocked` and `is_paused`, so existing server call checks and lead RLS deny access. Additional restrictive policies cover schedules, pipeline records and other surfaces containing lead details. Privileged lead and workflow RPCs receive an explicit guard while preserving their implementations and grants.

The paired Admin change adds Block from Calling / Unblock Calling to each associate overview. Unblocking sets normal calling; independent agreement and required-action pauses remain enforced. All existing restricted accounts receive the lead block when SQL is applied.

Validate with `node --test tests/calling-block-db.test.mjs tests/access-pause.test.mjs tests/access-pause-db.test.mjs`. Test direct CRM reads, privileged assigned-lead RPCs, open tabs and unblock recovery. Previously downloaded information cannot be recalled.

Rollback requires restoring the previous access-status function from migration 20261019070000, removing only the added `calling-block-guard` sections from the six named RPCs, dropping the new `outreach_calling_block` policies and `outreach_calling_access_changed` trigger, and reverting both frontend commits. Preserve policy rows and audit history.
