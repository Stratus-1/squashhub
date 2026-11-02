# League domain rules

- Doubles original pairs are dated rows in league_team_pairs (effective_from/effective_to); edits close+insert, never overwrite; why: bonus and history must follow the pair official on each fixture date.
- League scorecards: an unstarted fixture shows the current team roster unless a side is flagged `*_lineup_explicit = true`; started/locked rubbers never change; why: roster edits must reach upcoming games without rewriting reserves or history.
- Team standings derive from season-scoped fixtures + submitted/confirmed results via `src/lib/leagues/team-standings.ts`; rounds only label groups; why: a missing or unlinked round must never hide valid results.
- League team penalties are rows in `league_team_penalties` (positive points, reversal-stamped, never deleted) written only via admin RPCs and subtracted from season standings totals in `src/lib/leagues/team-penalties.ts`; why: penalties must never alter fixture scores, rubbers or bonus rules and must stay auditable.
