# Batch 2: lead timestamps and filter catalog access

Status: draft only. This batch does not execute SQL or deploy the site.

## Problem and changes

My Leads requests `crm.created_at`, which is absent in this CRM, then retries without a timestamp on every batch. Query the actual `created` column directly and use it for client-side date sorting. Preserve the assignment restriction and existing pagination.

The tag picker selects from `crm_filter_catalog`, but `authenticated` has no SELECT grant and the RLS-enabled table has no read policy. The proposed SQL allows SELECT only for authenticated users who have an active SALES or ADMIN permission and an enabled profile. It adds no anonymous access or write grants, does not disable RLS, and aborts if catalog policies have changed since inspection.

## Deployment order and stop conditions

1. Review `sql/outreach-filter-catalog-read.sql` and obtain explicit production approval for its policy and grant changes. Review catalog contents administratively before approving shared catalog access; the existing My Leads RPC already returns these options to active salespeople.
2. Apply the SQL as a separate database migration. Do not execute it automatically when merging this PR.
3. Verify in test accounts that an active salesperson and admin can load catalog choices, while inactive, disabled, and unrelated roles cannot. Confirm catalog writes are still denied.
4. Publish the `my-leads.js` change. Verify My Leads loads without a failed `created_at` request, dates sort correctly, and only the signed-in salesperson's assigned leads appear.
5. Stop this batch and roll back if any authorization case fails. Do not start batch 3 until batch 2 is verified.

## Tests

Run `node --test tests/my-leads-created.test.mjs tests/filter-catalog-access.test.mjs`, followed by `npm test`.

## Rollback

Revert the JavaScript commit. Remove only the added catalog policy and SELECT grant if no subsequent deployment depends on them:

```sql
DROP POLICY crm_filter_catalog_active_sales_read ON public.crm_filter_catalog;
REVOKE SELECT ON public.crm_filter_catalog FROM authenticated;
```

Keep RLS enabled. This restores the inspected pre-batch permissions, but also restores the tag-picker failure until an alternative is deployed.
