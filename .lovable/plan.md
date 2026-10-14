# Progression Standings Table: Swiss pilot at Riverside

Planning only. No code is written until you confirm the layout and rules.

## 1. What exists today
- **Tournament page:** `src/pages/ClubChampsView.tsx` has the Standings tab, Swiss pairing and rank colours. Inline standings are in `src/components/tournaments/InlineTournamentStandings.tsx`.
- **Swiss logic** (shared, tested):
  - `src/lib/tournaments/swiss-standings.ts` (`swissTable`, `positionSwapOrder`)
  - `src/lib/swiss-pairing.ts`
  - `src/lib/tournaments/swiss-round-gate.ts`
  - `engine-service.ts` and `structured-persist.ts`
- **Data tables:**
  - `club_champs_registrations`: entries, seeds, withdrawals
  - `club_champs_matches`: `round_number`, players, scores, status
  - `club_champs_rounds`
  - Tournament settings: `builder_spec` divisions and `tieBreaks`
- **Pilot switch:** `club_beta_features` with the Tournament Beta feature, read by `useClubHasTournamentBeta`. It defaults to off and is managed by Super Admin.

## 2. Is a schema change needed?
Probably not. Everything the table shows can be worked out from data the app already stores:
- seed order
- each round's opponent, result and score
- byes and walkovers
- withdrawals

No database change is planned. If SportyHQ shows something we don't store, such as a frozen snapshot of the table after each round, that would be raised before any change.

## 3. Proposed basic table (one per division)

| Column | Meaning |
|---|---|
| Pos | Current position |
| Movement | Places gained or lost since last round (up/down/same) |
| Player | Name and club |
| Seed | Starting seed |
| R1 … Rn | One cell per round: opponent's seed/name, W/L, game score, or BYE / WO / — |
| P / W / L | Played, won, lost |
| Games +/- | Games won minus games lost (optional) |
| Pts | Points, only when the division is not position-swap |

**Sorting**
- If the division uses position swap (Uitsig-style), the order comes from `positionSwapOrder`, replayed round by round. A lower-placed player who wins takes the winner's spot, and the loser drops to the winner's old spot.
- Otherwise, the order comes from `swissTable` using the division's configured tie-breaks.
- The "after round N" positions come from replaying results in order up to round N, so the Movement column is always consistent.

## 4. Switching it on for Riverside only
- Add one new pilot feature key, `tournament_progression_standings`, to `club_beta_features`.
- Turn it on for Riverside only. It stays off for all other clubs.
- Clubs without the switch see the current standings unchanged.
- Riverside admins get an option to switch between the classic and progression views.
- It's a display change only: no results, pairings or other clubs' data are touched.
- Testing uses made-up players in a Riverside test tournament before anyone else sees it.

## 5. What I still need from you
1. SportyHQ screenshots of the standings page, on both phone and desktop.
2. What a round cell should show: opponent seed, opponent name, score, or a mix.
3. Byes and walkovers: count as wins? Do they move position?
4. Withdrawals: does the player stay on the table, greyed out at the bottom, or keep their spot?
5. Unplayed games: when the round is still in progress, does the table show the last finished round or update live?
6. Tie rules for points-based Swiss: should this follow the division's settings or a fixed order?
7. Whether players see the table too, or only admins at first.

## 6. Risks
- **Older tournaments:** matches with no `round_number` can't be placed in a round. These will show "—" or fall back to the classic view.
- **Incomplete matches:** nobody moves until a result is confirmed, and an unconfirmed result is shown as "pending" in its round cell.
- **Withdrawals and byes:** these need the explicit rules above. If we guess wrong, positions will be wrong.
- **Ties:** in position-swap mode ties can't happen. In points mode, the tie-break order must match the division's settings.
- **Several divisions in one tournament:** each division has its own table and replay, and players are never mixed across divisions or pools.
- **Uitsig:** stays on its current live view and won't be switched on without your approval.

## Technical steps (after approval)
1. Add a pure function `progressionTable(division, entries, matches)`. It returns rows, per-round cells and movement, and reuses `swissTable` and `positionSwapOrder`.
2. Write tests for it covering:
   - byes
   - walkovers
   - withdrawals
   - pending results
   - missing round numbers
   - several divisions
3. Build a `ProgressionStandings.tsx` component, shown inside the Standings tab only when the pilot switch is on.
4. Add a `useClubBetaFeature(clubId, key)` helper and turn the switch on for Riverside.
5. Test end to end on Riverside with made-up players, then get your sign-off before rolling out further.
