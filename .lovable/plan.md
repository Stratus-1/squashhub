# Round 2 — tier picker, home/away swap, smarter court rotation

## Goal

Make round 2 (and any later round) faster and fairer to set up:

1. Pick teams by **league tier** (1st / 2nd / 3rd / 4th) instead of ticking every team — reserves for that tier are included automatically.
2. **Reverse home/away vs the previous round** in one click.
3. **Court rotation** that actually spreads each team across all courts over the rounds.

**Safety:** existing rounds (round 1) are never modified. We only read prior fixtures to inform round-2 choices. Saved scorecards, lineups and bookings stay untouched (the existing non-destructive save guard already protects them).

---

## 1. Group teams by league tier (no schema change)

Reuse the same fixture-based tier inference already used in `LeaguesTab`:

- For this association, fetch all prior `league_rounds` and their `platform_league_fixtures`.
- Parse each round's name with `/(\d+)(?:st|nd|rd|th)\s*League/i` → tier number.
- Map every `team_code` that appeared in those fixtures to its tier.
- Reserves (leagues named like "1st L Reserves", "2nd Reserves") are tagged by the same regex on the league name.

UI inside the expanded round (replaces the long checkbox grid):

```text
Pick league:  [ 1st league ▾ ]   [x] Include reserves
Teams in this round: Apex Eagles, Canopy Kings, Leadwood Legends, …  (chips)
[Edit team list ▾]   ← old per-team checkbox grid, collapsed by default
```

- Tier dropdown lists every tier we found in prior rounds for this association.
- Default selection = the tier parsed from the *current round's own name* (e.g. "2nd League round 1" → 2nd).
- Selecting a tier rebuilds `selectedTeams` = all teams with that tier (plus matching reserves if the toggle is on).
- Manual checkbox grid stays available behind a collapse for exceptions.
- If no prior rounds exist for that tier yet, the dropdown shows "Custom" and the grid opens automatically.

---

## 2. Reverse home/away vs previous round

In the round editor add a checkbox next to "Auto-distribute":

```text
[ ] Reverse home/away from previous round
```

When ticked, `autoDistribute` will:

1. Find the most recent prior round (same `association_id`, lower `round_number`) whose fixtures cover the currently selected team set.
2. Pull its saved fixtures.
3. Build pairings by swapping `home_team_code` ↔ `away_team_code` for each unique pair found there.
4. Slot them onto this round's dates/times/courts using the fairness allocator from item 3.
5. If no usable prior round is found, toast and fall back to standard round-robin.

This only runs at generation time; admins can still drag pairings afterwards. Round 1 fixtures are never touched.

---

## 3. Real court rotation

`rotateCourtsOnly` today only shifts the court index per date, so teams that played on Court 1 in round 1 often land on Court 1 again. Replace with a **fairness scorer**:

- Build a per-team court-usage histogram from all prior saved fixtures of the same teams in earlier rounds of this association, plus fixtures already placed in this round.
- For each slot, pick the court with the lowest combined `usage(home, court) + usage(away, court)`, ties broken by court id. Two fixtures in the same date+time slot never share a court.
- Process the most "court-starved" pairing first inside each matchday so it gets first dibs on a fresh court.

Used by both:
- `allocateRoundRobinByDate` (when generating fixtures) — replaces the simplistic `(matchIdx + roundIdx) % courtIds.length`.
- The standalone "Rotate courts" button — only `court_id` changes; pairings, dates, and times stay locked.

Toast after rotation: "Rotated courts — each team is now spread across courts as evenly as possible."

---

## Technical notes

Files touched:

- `src/components/league-games/fixtures/scheduler.ts`
  - New helpers: `buildPriorCourtUsage`, `reversePairingsFromPrior`, `allocatePairingsWithCourtFairness`, `fairCourtAssignmentForExistingFixtures`.
- `src/components/league-games/FixturesTab.tsx` (`RoundCard`)
  - Fetch prior rounds + their fixtures (one query keyed on association + selected team set).
  - Derive tier map; new tier `Select` + reserves toggle; collapse old checkbox grid behind "Edit team list".
  - New "Reverse home/away from previous round" checkbox.
  - Wire `autoDistribute` to use reversed pairings (when ticked) and the fairness allocator (always).
  - Rewrite `rotateCourtsOnly` to call `fairCourtAssignmentForExistingFixtures`.

No DB migration. No changes to scoring, lineups, results, or the non-destructive save path.

---

## Out of scope (locked in)

- **Reshuffling already-played/scheduled rounds.** Round 1 fixtures, court bookings, scorecards and lineups stay exactly as saved — we only *read* them.
- Cross-tier fixtures (mixing 1st and 2nd league teams in one round) — admin can still override via the checkbox grid if they really want.
- Auto-creating round 2's dates / venue / courts — admin still clicks "Add round" and fills in date range, courts and times.
