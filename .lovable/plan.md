## Problem

At CSIR, the "3rd League" and "11th/12th League" tiers are inactive (no players registered), but the league team rows still classify into those divisions. Today's handicap builder fills a default size (5) into every division present in the classification table — even empty ones — so a #1 in the 4th League ends up ~5 slots behind a #1 in the 2nd League, and 10↔13 blows out to ~15 slots. That's why Tertius de Bruin shows `-12` against Christiaan Daniels.

The user wants inactive tiers ignored so the next active division is treated as the immediately adjacent one:
- 2nd League → 4th League = 1 division apart
- 10th League → 13th League = 1 division apart

## Fix

Change how `sizes` / offsets are built in `src/lib/tournament-formats/handicap.ts` so only divisions with at least one **active main-team player registration** count toward the cumulative offset.

### `loadClubLadderContext`

1. Populate `sizes[d]` only from main-team registrations that carry a real `player_rank` (already the case).
2. Remove the block that fills a default `sizes[meta.division] = 5` for every division seen in `classify.values()` — that block is what re-inflates inactive tiers.
3. If a division ends up with no registrations but IS the home division of the strongest reserve rank in use, still include it with a size derived from the max `shadow_player_rank` seen. (Keeps shadow-ranked reserves consistent.)
4. `buildDivisionOffsets` already sorts numerically and cumulates only what's in `sizes`, so once inactive tiers are dropped the offset table naturally collapses (e.g. divisions {2,4,10,13} → offsets {2:0, 4:5, 10:10, 13:15} instead of a slot-per-missing-tier expansion).

### `findReservesMissingShadowRank`

Apply the same rule so the shadow-rank dialog offers slot pickers only for active divisions.

### `applyHandicapsToChamp`

No signature change — it consumes the offsets we just fixed, so all existing tournaments (Bells + standard) recompute correctly on the next "Apply handicaps" click / schedule rebuild.

## Validation

- Rebuild CSIR "Bells night 2nd & 4th League" schedule → expect small handicaps (~0–5 range at multiplier 1), not `-12`.
- Rebuild "Bells night 10th & 13th" → same.
- Check "Bells night 6 & 7th League" (adjacent tiers, no inactive gap between them) still produces the same handicaps it does today (regression guard).
- Standard tournaments spanning divisions with no gaps must remain unchanged.

## Out of scope

- No DB migration or schema change.
- No UI change; the handicap suffixes in `Tournaments.tsx` and Bells marker will just show corrected numbers after rebuild.
- Multiplier / divider settings per tournament stay as-is.
