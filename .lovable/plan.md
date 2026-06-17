## Goal
Apply the same rank-based green-to-red color coding from individual league standings to the **League vs League — Summary** table in cross-league tournaments.

## Current State
- `ClubChampsView.tsx` already has `getRankRowStyle(rank, total)` which returns a dark-green → light-green → pink → red gradient based on position.
- Per-league player standings already use this color coding.
- The cross-league summary table (`renderCrossLeagueSummary`) currently uses a neutral style with only a subtle `bg-primary/5` highlight for the leading league.

## Change
In `src/pages/ClubChampsView.tsx`, update `renderCrossLeagueSummary`:
1. Sort the summary rows by PF descending (already done).
2. For each row, compute its rank index and apply `getRankRowStyle(i, rows.length)` as an inline `style` on the `<tr>`, just like the per-league standings do.
3. Remove or keep the existing `isWinner` styling as a subtle overlay (e.g. font-semibold + ring) so the color coding is the dominant visual signal.

## Result
The cross-league summary table will show:
- Leading league = dark green row
- Middle league(s) = light green / pink rows  
- Last league = red row

This matches the screenshot you confirmed with "same".
