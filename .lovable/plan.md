# Plan only: per-category Swiss rounds for positional Swiss

Nothing is built, migrated or published until you approve a phase. Live Riverside and Uitsig tournaments are untouched.

## Confirmed requirement
- Each category, or each Swiss pairing group within a category, has its own:
  - entrant count and validated position-map template (8–32 entrants, odd counts and byes included)
  - suggested number of rounds, which the organiser can override
  - fixtures, round progress and standings
- Categories move independently. For example, Men's A (10 entrants, 4 rounds) can be in Round 4 while Men's B (15 entrants, 5 rounds) is in Round 2.
- There is no round count shared across the whole tournament.

## What already works per category
- **Engine:** the round count sits on each division's Swiss stage (`PlannedStage.swissRounds`). The round gate, next-round creation and standings all read the stage they belong to (`engine-service.ts`: `swissRoundGate(mine, st.swissRounds)`).
- **Server guard:** `guard_swiss_round_progression` reads `tournament_stages.config.swissRounds` for that one stage and locks per stage.
- **Stored per category:** `tournament_stages` rows are created per division (`structured-persist.ts`). Older tournaments keep `club_champs.swiss_rounds` as data keyed by group number.
- **Live edits:** `swiss-shorten.ts` already changes a single division's stage and that group's entry in `club_champs.swiss_rounds`.

## Places that wrongly share one round count
1. **`src/lib/smart-builder/to-existing.ts` (bug):**
   - It keeps one `swissRounds` number for the whole tournament: `if (first.kind === "swiss") swissRounds = first.swissRounds ?? swissRounds`.
   - It then writes that single number to `club_champs.swiss_rounds`, so the last Swiss category's count wins.
   - It should write `{ "1": 4, "2": 5, ... }` keyed by group, the same way `swiss_pools` is already written.
2. **`src/lib/tournaments/swiss-progress.ts`, `setupSwissRounds`:**
   - When a category has no override, it falls back to the tournament-wide `setup.format.swissRounds`.
   - It matches categories by the start of their label (`startsWith`). That is fragile: for example, "Men's A" also matches the start of "Men's AB".
   - It should use each category's own saved setting and match by category id, not label.
3. **`src/lib/smart-builder/swiss-progression.ts`:** its estimated and confirmed round counts take one `format` object. The builder needs these per category, with the global value only as a starting suggestion.
4. **Legacy readers of `club_champs.swiss_rounds`:** we must check that nothing reads this as a single number. Old tournaments that saved a single number need a read-only fallback (apply it to every group), never a rewrite of saved data.

These are to be fixed in the new path. The fallback for existing tournaments stays unchanged.

## Architecture
- **Setup:** each category in the builder gets its own Swiss settings:
  - template type (Positional Swiss)
  - entrant count, from entries or an expected number
  - the template picked automatically for that count
  - suggested rounds, the organiser's chosen rounds, and whether the count is confirmed
- **Builder view, one row per category:**
  - entrants
  - template name, plus how many byes each round
  - suggested and chosen rounds
  - estimated matches (rounds × number of matches per round)
  - court demand (matches × slot length, against available court time)
  - warnings: more rounds than the template supports, or repeat opponents expected
- **Engine:** a new stage type `swiss_positional`, one per category, with its own:
  - template and round count
  - set positions for each fixture, with winners and losers moved into the next round's positions as soon as a result is confirmed (atomic and safe to repeat)
  - standings: the final position equals the final slot
- **Guards on changing rounds:**
  - Before the draw: free to change.
  - After the draw: the count can't go below the number of rounds already created or completed (reuse `swissConfirmIssues`).
  - Changing it needs a preview of the impact and confirmation. It affects only that category's stage, and never deletes results.
- **Isolation:** no change to existing `swiss` stages, the `position_swap` rule, Uitsig or live Riverside tournaments. The new path only runs behind a Riverside switch.

## Later: Swiss, then round robin, then play-offs
- Each category's stage list becomes `swiss_positional` → `round_robin` (top N, or pools) → `knockout`, using the existing progression and qualifier rules.
- Each change of stage waits on that category's own gate. Other categories are unaffected.
- To be designed once positional Swiss is signed off.

## Phases
1. **Pure calculations and tests:**
   - templates for 8–32 entrants
   - a checker for each template
   - per-category suggested rounds and demand estimates
   - tests based on your screenshots
   - tests that one category's round count never changes another's
2. **Fix the shared count in the new path only:** per-group `swiss_rounds` from the builder, and category matching by id. Includes tests that old tournaments still read correctly.
3. **Engine:** `swiss_positional` per category, moving players between positions on results, and standings.
4. **Saving and server guard:** new optional position fields, and a separate guard for each stage.
5. **Builder screen** for each category, Riverside only.
6. **Tests with made-up Riverside players:** four categories with different entrant and round counts, running in parallel. Then your sign-off.

## Decisions still needed
- How suggested rounds are worked out:
  - the smallest number of rounds that gives one clear winner, or
  - your SportyHQ sizes (e.g. 10 entrants → 4 rounds, 12 → 3)?
- Should a Swiss pairing group inside one category also be allowed its own round count, or only whole categories?
- Should repeat opponents be allowed (as SportyHQ does) or avoided?
