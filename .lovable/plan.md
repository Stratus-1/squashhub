# Nelspruit "Fill up your league teams" notice: diagnosis and fix

## What happened
- On 1 Oct 2026 at 04:00 UTC, 24 Nelspruit admins and captains each got a notice titled "Plan league games for next week" with the text "Nelspruit Squash Club: the new squash week starts tomorrow (2026-10-02). Fill up your league teams from the top down."
- It came from the daily reminders job, in its "league planning" section.

## Should Nelspruit have received it?
No. None of Nelspruit's leagues has the fill-up reminder switched on in league setup (0 opted in). The current rule in the project would have sent nothing.

## Root cause
The reminders job running live is an older version than the one in the project:
- **Older live version:** decides club-wide, using the club setting "Fill top down" (Nelspruit still has this on). It then messages every admin/captain role and delegate, whether or not a league has games coming up.
- **Version in the project:** sends only for leagues with "Fill-up reminder" switched on, only when that league has a playable fixture in the next 14 days, and only to that league's captain(s).

How we know: the notices sent carry the older version's wording and tag ("ref_table: clubs", no league named). No notice in the system has ever carried the newer version's league-level tag. So the newer rule was never deployed.

## Smallest safe correction
1. Redeploy only the existing reminders function from the project, with no code change. That makes the per-league rule live for every club. Gordon's Bay and any league that has the reminder on keep getting it, as long as there are fixtures.
2. Optional: switch Nelspruit's old club-wide "Fill top down" setting off for clarity. It is no longer used by the reminder once step 1 is done, so it is not required.
3. Check: run the reminders logic as a dry run, or read the next day's log. Nelspruit should get 0 league-planning notices. A league with the reminder on and fixtures within 14 days should still get one.

No data changes are needed. The 24 notices already sent can stay or be dismissed by the users.

## Technical details
- Live notices: `notifications.data.kind = 'league_planning_reminder'`, `ref_table = 'clubs'`, `ref_id = club_id:member_id`.
- Repo `supabase/functions/reminders/index.ts`, section 5: filters `leagues.fill_up_reminder_enabled = true`, `archived_at is null`, `capOn('leagues')`, playable `platform_league_fixtures` within 15 days. It sends with `ref_table = 'leagues'` to `captain_member_id` plus `member_league_registrations.is_captain`.
- `clubs.fill_top_down_enabled = true` for Nelspruit. No Nelspruit league has `fill_up_reminder_enabled = true`.
- The separate `notify-league-week-kickoff` function (availability and captain fill-up notices) sent nothing to Nelspruit.
- Redeploying also ships any other unreleased changes in `reminders/index.ts`. Before deploying, check that file's diff against the live version for other unrelated changes.
