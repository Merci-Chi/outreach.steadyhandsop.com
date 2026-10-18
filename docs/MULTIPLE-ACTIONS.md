
## Multiple dated actions

Deploy the matching Admin, Onboard, and Outreach changes together. In Supabase,
apply `sql/questionnaire-multiple-actions.sql` from Admin (the identical Outreach
migration is `supabase/migrations/20261018230000_questionnaire_multiple_actions.sql`).
The base assigned-action and phone-setup migrations must already be applied.
This upgrade includes the missing choose-start-date/assign_action_v2 setup;
it does not need the earlier select-start-date patch to be run separately.
Do not rerun earlier migrations after this upgrade.

Each click on Assign questionnaire inserts a new ID without replacing existing
pending or completed actions. Assignment and completion dates appear in both
portals. Each action keeps its own agreement, start date, and completed answers;
cancelling one action leaves the others intact. The per-associate preference
record remains the latest response for existing overview consumers. Existing
completed answers are backfilled when they match the saved assignment dates;
responses overwritten before this upgrade cannot be recovered.

No live Supabase migration is executed by these source changes.
