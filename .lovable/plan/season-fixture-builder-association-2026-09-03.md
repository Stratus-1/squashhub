# Season Fixture Builder (Association)

A one-pass builder that creates the whole season — all leagues, both rounds — from a single screen, instead of opening a fixtures dialog per league.

## What exists today

- Teams are pulled per league via `association_league_teams` (season-aware).
- A per-league dialog generates two-leg round-robin fixtures using `src/lib/leagues/two-leg-fixtures.ts` (circle method, play weekdays, skip dates, venue = home club) and saves via `association_save_fixtures`.
- Public holidays come from a local SA holiday helper; there is no school-holiday awareness and no multi-league run.

## What we build

### 1. Season Fixture Builder screen (Leagues → Rounds & fixtures → "Build season")

Step 1 — Season & leagues
- Pick season year (e.g. 2026); list every league for that season grouped Men / Ladies / Mixed with team counts.
- Tick which leagues to include; leagues with fewer than 2 teams are flagged.

Step 2 — Play nights per league
- Each selected league gets its own play night(s): Men 1st = Tuesday, Ladies 2nd = Wednesday, etc.
- Bulk helpers: "set all to Tuesday", copy from another league.
- Season start date (no end date — end is derived from the number of rounds).

Step 3 — Calendar exclusions
- Auto-load SA public holidays for the season year(s).
- Auto-load SA school-holiday windows (term break ranges) for the year, shown as whole weeks that can be excluded with one tick.
- Free-form extra dates/date ranges.
- Exclusions are evaluated per play night, so a league playing Tuesday can be knocked out for a week while a Wednesday league still plays — dates shift forward rather than being dropped.

Step 4 — Rounds & venues
- Rounds: 1 or 2 (default 2, "round 2 swaps home and away").
- Option: round 2 starts immediately after round 1, or on a chosen date (mid-season break).

Step 5 — Preview & save
- Full calendar preview grouped by league and by week, showing date, home vs away, venue club, and any week that was skipped and why.
- Warnings: a club hosting two fixtures on the same night, a team playing twice in a week, uneven home/away counts.
- Save writes all leagues in one call; existing fixtures for that season are either kept or replaced (explicit choice, with a count shown before writing).

## Technical notes

- Extend `src/lib/leagues/two-leg-fixtures.ts` into a season generator: input is a list of `{ league, teams, playDows }` plus shared start date, exclusion set and round options; output is fixtures per league plus a per-league skipped-week log. Keep the existing single-league function working.
- New `src/lib/leagues/calendar.ts` for SA public holidays (observed-Monday rule) and SA school-term break ranges by year, plus a week-expansion helper.
- New component `src/components/association-admin/SeasonFixtureBuilder.tsx` (stepper dialog/panel), launched from `AssociationFixturesPanel`.
- Saving reuses `association_save_fixtures`; add a replace mode (delete existing fixtures for the season + selected leagues inside the same function) so a rebuild is idempotent. Fixtures with recorded results are never deleted — they are reported as blocking.
- Validation and conflict checks live in the lib so they are unit-testable; add tests for round-robin balance, date shifting across excluded weeks, and per-league divergent play nights.

## Test run

Generate the 2026 NSA season from the existing 26 league teams, review the preview and conflict warnings, and only then save.

## Not in this phase

- Per-club venue/court assignment beyond "home club".
- Automatic notification of captains when the season is published.
