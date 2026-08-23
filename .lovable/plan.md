# One reserve pool per league level (instead of "reserves per team")

## What happens today

Checked the current Club League setup code and the saved data model:

- Step 2 of the setup asks **"Reserves per team"**. The number is multiplied by the number of teams when players are drafted (`reserves x numTeams`).
- When you save, the wizard already creates **one single "Reserves" league row** for that level (for example "Men's 1st Reserves"), and every drafted reserve goes into that one row. So the shared pool already exists in the data — it is the *question and the counting* that are per team, not the storage.
- The reserves preview card shows "X filled / N slots" where N is the *team* size, which makes a shared pool look wrongly capped and shows misleading "(empty slot)" rows.
- The number is also stored as `reserves_per_team` on the league rows and on the league rules, so re-opening the setup keeps asking the per-team question.
- The separate "Add reserves" dialog already behaves as a pool: it finds the group's single Reserves row (or creates it) and adds people to it.

So this is mostly a wording, counting and display change — no restructuring of how reserves are stored.

## Proposed change

1. **Ask for a pool, not a per-team count.**
   Step 2 field becomes **"Reserve pool size (shared by all teams in this league)"** with helper text explaining one pool serves every team at that level, and that it is a target, not a hard cap. The drafted reserves become exactly that many players (no multiplication by team count).

2. **Requirement maths follows the pool.**
   Total players required = (teams x starting players per team) + reserve pool size. The summary line and the shortfall warning use that.

3. **Reserves card shows a pool.**
   Header shows "Reserve pool — N players"; the list shows only real people (no phantom empty slots); the footnote explains any reserve can be called up into any team at that level, subject to the association's substitution rules. Ordering (reserve 1, 2, 3...) is kept because call-up order is useful.

4. **Doubles / hybrid leagues.**
   The reserve pool holds **individual players**, not fixed pairs — a reserve pairs up with whoever needs them on the night. Fixed season pairs stay a team-level concept only (the wizard already never creates pairs on the reserves row). This is what makes one pool work for the doubles league.

5. **Persist the pool size properly.**
   Store the pool size once per league level, and stop writing a per-team reserve number. Existing leagues are backfilled so nothing is lost: current pool size = number of players already in that level's Reserves row, falling back to `reserves_per_team x number of teams`.

6. **Re-opening / editing a league group** prefills the pool size from the saved value, and the Reserves row stays the same row (no duplicate "Reserves" leagues created on re-save).

Nothing changes for: substitution eligibility rules, the "Add reserves" dialog, lineup swaps, or how reserves appear on a fixture.

## Technical detail

- `src/lib/leagues/team-setup.ts`: add `reservePoolSize` to `computeTeamRequirements` (`total = numTeams * startingPlayersPerTeam + reservePoolSize`), keeping `startingPlayersPerTeam` unchanged. Keep the existing `reservesPerTeam` input accepted as a deprecated alias so old callers/tests don't break, then migrate callers.
- `src/components/club-admin/StepByStepLeagueSetup.tsx`:
  - rename state/label to `reservePoolSize`; `reservePicks = top.slice(teamPlayers, teamPlayers + reservePoolSize)`;
  - reserves card rendering (currently `Math.max(perTeam, allocation.reserves.length)` slots) renders only `allocation.reserves`;
  - save path writes `reserve_pool_size` to `league_rules` for the level's rows and stops writing `reserves_per_team`.
- Migration: `ALTER TABLE public.league_rules ADD COLUMN IF NOT EXISTS reserve_pool_size integer;` plus a data backfill from existing reserves registrations. `leagues.reserves_per_team` and `league_rules.reserves_per_team` are left in place (unused) so nothing that still reads them breaks.
- `src/components/club-admin/LeaguesTab.tsx`: edit-context prefill reads `reserve_pool_size` (fallback: count of `is_reserve` registrations in the group); reserve badges/labels updated to pool wording.
- Tests: extend `src/test/team-setup.test.ts` with pool maths (0 pool, pool independent of team count, shortfall) and a doubles case asserting the pool is player-based, not pair-based.
