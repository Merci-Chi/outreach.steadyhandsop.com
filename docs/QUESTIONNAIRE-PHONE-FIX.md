# Questionnaire phone submission repair

The error `Could not find the function public.outreach_action_submit_v2 ... in the schema cache` means the phone RPC migration has not been applied to the Supabase project.

Run `sql/questionnaire-phone-setup.sql` in the Supabase SQL editor for project `glonbvrcudwuzjundrii`. It adds the phone fields, installs the authenticated submission RPC, and refreshes the API schema cache. It assumes the assigned questionnaire tables and original submission RPC are installed. It is safe to rerun; existing responses remain unchanged.

Selecting **I need a US number** saves `phone_setup = 'needs_number'` and `us_phone_number = NULL` with questionnaire completion. There is no external link or number setup redirect. The existing Admin → Sales Associates → Other Actions page displays this request and has a **Needs a US number** filter.

Existing numbers and Google Voice numbers are formatted as `+1(202)555-0101` during entry and stored in normalized `+12025550101` format. Input formatting limits the national number to 10 digits, including pasted values. The weekly-hours question is removed: the two-hour Monday–Friday schedule saves 10 hours per week automatically.

Repository changes are proposed in pull requests. This SQL has not been applied to the live project automatically.
