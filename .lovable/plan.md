# Bells Doubles Tournament Format

A new scoring mode for the existing tournament module. Pairs play time-capped round-robin games inside a "league" (group); standings = total points scored across all games.

## Concept recap

- **Entry**: members sign up, pick a preferred partner. Admin confirms or overrides → list of doubles pairs.
- **Allocation**: admin distributes pairs across Leagues (1, 2, 3…). Each league has its **own time cap** (e.g. 30 / 25 / 20 min).
- **Play**: round-robin inside each league. A bell ends the game at the cap; the score at that moment is recorded.
- **Standings**: total points scored across all games (per your answer). No win/loss column needed for ranking.
- **Scoring entry**: a match marker / referee enters scores live on the night (uses existing Match Marker module).

## Schema additions (one migration, additive only — nothing existing breaks)

`club_champs`:
- `scoring_mode text default 'standard'` — `'standard'` (current win-based) or `'time_capped_points'` (bells)
- `group_durations jsonb default '{}'` — `{"1": 30, "2": 25, "3": 20}` overrides the champ-wide `match_duration_minutes` per league/group

`club_champs_matches`:
- `side_a_points int` — points scored by Player A + Partner A when bell rang
- `side_b_points int` — points scored by Player B + Partner B
- (existing `score` text stays for backwards compat; new bells UI writes the two int columns and a derived `"15-12"` into `score`)

## UI changes

1. **Create Tournament wizard** (`Tournaments.tsx` create flow) — new "Format" choice: *Standard knockout/round-robin* vs *Bells (time-capped, points-for)*. Bells locks `match_type = 'doubles'`.
2. **Pair allocation step** — when `scoring_mode = 'time_capped_points'`, show a "Time cap per league" input next to each group/league header. Saves to `group_durations`.
3. **Match marker dialog** for bells matches — replace the games-to-3/5 panel with: live countdown using that group's duration, two big point counters (Side A / Side B), a "Bell" button that locks the score, and a save.
4. **Standings table** — when `scoring_mode = 'time_capped_points'`, columns become: *Pair · Games Played · Points For · Points Against · Diff*, sorted by Points For desc. (We compute & show Against/Diff but rank by Points For only, per your choice.)
5. **Partner picker on signup** — registration form already supports `partner_mode = 'players'`. We surface a "Preferred partner" dropdown to the signing-up member; admin sees pending pairs in the existing Finalize Setup dialog and can override (that dialog already exists — `FinalizeTournamentSetupDialog.tsx`).

## Out of scope (won't change)

- League allocation rules / sub eligibility (different module).
- Existing standard tournaments — completely unaffected; only new champs with `scoring_mode = 'time_capped_points'` see the bells UI.
- No new tables — all additive columns.

## Files touched

```
supabase migration                              (additive columns)
src/pages/Tournaments.tsx                       (format toggle in wizard, standings split)
src/components/tournaments/CreateChampDialog... (format + group durations)
src/components/tournaments/AllocatePairsDialog  (per-group time cap inputs)
src/components/tournaments/StandingsTable       (bells variant)
src/pages/MatchMarker.tsx                       (bells timer + 2-counter mode when match is bells)
src/components/tournaments/FinalizeTournamentSetupDialog.tsx  (already handles swaps — no change)
```

Estimated 1 migration + ~6 frontend file edits. No edge functions needed.
