# Round 2 Fixture Generation — Implementation

The scheduler helpers (`buildPriorCourtUsage`, `reversePairingsFromPrior`, `allocatePairingsWithCourtFairness`, `fairCourtAssignmentForExistingFixtures`) already exist in `src/components/league-games/fixtures/scheduler.ts`. This step wires them into the round editor UI.

## Safety guarantee (explicit)

- All new logic runs **only** for the round currently being edited.
- Prior rounds' `platform_league_fixtures` are **read only** (to learn tier membership, prior pairings, and prior court usage).
- No writes touch any other round. Existing scorecards, lineups, dates, courts, and pairings on prior rounds stay exactly as saved.

## Changes

### 1. Tier picker in Round editor (`FixturesTab.tsx` / `RoundCard`)

- Infer tier per team from prior rounds: for each team code, find the most recent prior round that contained it; group teams by that round's name (e.g. "3rd League").
- Replace the long team checkbox grid with:
  - **Tier dropdown** — lists distinct inferred tiers + "Custom".
  - Selecting a tier auto-checks exactly that tier's teams.
  - "Edit team list" disclosure reveals the existing checkbox grid for manual override.
- When opening a saved round, infer its tier by majority of its own saved fixtures; fall back to "Custom" if mixed.

### 2. Reverse home/away from previous round

- New checkbox in the round editor: **"Reverse home/away from previous round"**.
- When checked and `Auto-distribute` is clicked:
  - Find the most recent prior round in the same association whose fixtures cover the currently selected team set.
  - Call `reversePairingsFromPrior(priorFixtures, teamSet)` to get swapped pairings.
  - Feed those pairings into `allocatePairingsWithCourtFairness` for slot/court placement.
- If no suitable prior round exists, fall back to normal round-robin and show a toast.

### 3. Court fairness

- When `Rotate courts` is enabled on the round being edited:
  - Build prior usage histogram via `buildPriorCourtUsage(priorFixtures, teamSet)`.
  - Use `allocatePairingsWithCourtFairness` instead of the current modulo allocator.
- New "Re-balance courts on this round" button (visible only on the active round) calls `fairCourtAssignmentForExistingFixtures` — updates only `court_id` on the current round's rows.

## Out of scope (unchanged)

- No reshuffling of any prior round.
- No cross-tier fixtures auto-generated.
- No auto-creation of round 2 dates/venue/courts — admin still creates the round shell.

## Files

- `src/components/league-games/FixturesTab.tsx` — tier picker, reverse checkbox, fairness wiring, re-balance button.
- `src/components/league-games/fixtures/RoundCard.tsx` (if separate) — same.
- No DB migration, no schema change, no edge function change.
