# Site preview sharing

Outreach preview actions use the selected lead's existing `crm.sitekey`. The resolver reads its active `site_keys` record and preserves the key's exact case. It never creates or replaces a site key and does not substitute saved `previewurl` or pipeline `preview_url` values.

- Outreach and Call: **Send Site Preview** opens Text, Email, Share, and Copy actions.
- My Leads: **View Site Preview** resolves the assigned CRM lead before opening it.
- Pipeline templates: **Site Preview Ready** verifies the linked CRM lead/key before sending.
- Contacts without an active site key cannot send the preview template. Other templates remain available.

The preview URL is `https://steadyhandsop.com/Previews/generic.html?sitekey=EXISTING_SITE_KEY`.

Text and Email open drafts in the associate's device apps. The associate chooses to send. Opening a draft is not a delivered message, paid sale, commission event, or completed client setup.

## Portal continuation

The preview renderer and client portal are separate applications. The coordinated `steady-hands-sitekey-update.zip` supplied with this work contains the corresponding `website/Previews/` and `portal/` updates. Install them in `Merci-Chi/Steadyhandsop` and `Merci-Chi/portal.steadyhandsop.com` to make the preview's approval CTA continue into popup onboarding using the same `sitekey`. This Outreach change preserves the public preview URL, so existing links continue working while those applications are updated.

No new SQL is introduced. Existing CRM ownership RLS and active `site_keys` reads must already be configured. The separate portal still requires its public `get_site_by_key` RPC, invitation functions, agreement tables, and server-verified Square checkout backend.

## Verification

```sh
node --test tests/preview-resolver.test.mjs tests/pipeline-previews.test.mjs tests/outreach-workflow.test.mjs
```

Tests cover case preservation, fresh active-key checks, representative ownership, stale URLs, slow lookups after changing contacts, and switching contacts during send verification. Live Supabase, native SMS/email delivery, and browser rendering were not verified in the authoring environment.
