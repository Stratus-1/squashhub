# Tournament views pilot at Riverside: Pool grid and Swiss progression

Planning only. No code is written until you confirm the layouts and rules. There are two separate views so that neither design is forced onto the other format.

## Shared foundation (what exists today)
- **Tournament page:** `src/pages/ClubChampsView.tsx` (Standings tab, Swiss pairing, rank colours) and `src/components/tournaments/InlineTournamentStandings.tsx`.
- **Shared logic:**
  - `src/lib/tournaments/swiss-standings.ts` (`swissTable`, `positionSwapOrder`)
  - `src/lib/swiss-pairing.ts` (pools and pairing)
  - `swiss-round-gate.ts`, `structured-matchups.ts`, `standings-outcome.ts`
- **Data tables:**
  - `club_champs_registrations`: entries, seeds, withdrawals
  - `club_champs_matches`: `round_number`, players, scores, status, court, date and time
  - `club_champs_rounds`
  - Tournament settings: `builder_spec` divisions and pools
- **Pilot switch:** `club_beta_features`, where each club can have features switched on one by one. These are off by default and managed by Super Admin.
- **Schema:** no database change is expected for either view. Everything shown can be worked out from data already stored.

## View A: Pool grid and order of play (round-robin pools)
Based on the NJSA "Pool Matches" layout.

**Top: pool grid**
- Columns: Nr, Name, one column per player number (1..N), Total Games, Rank.
- Each cell holds the score from the row player's point of view, for example "3-1". Unplayed games are blank.
- Cells where a player meets themselves are blacked out.
- Rank uses the division's existing round-robin ranking rules, so no new ranking rules are needed.

**Bottom: order of play**
- Columns: Rd, Order of Play (e.g. "1v5"), Result, Score, Day/Time, Venue, Court.
- Rows are grouped by `round_number`.
- Day/time, venue and court come from the match or its booking.
- "1v5" means player number 1 against player number 5 within that pool.

**Data support:** fully supported. The only open question is where the player numbers 1..N come from: seed order, entry order, or numbers fixed when the draw was made.

## View B: Swiss progression table (Swiss events)
- **Columns:**
  - Pos
  - Movement
  - Player
  - Seed
  - R1..Rn, each showing the opponent, W/L and score, or BYE / WO / —
  - P / W / L
  - Games +/- (optional)
  - Pts, only when the division isn't position-swap
- **Order:**
  - Position-swap divisions follow `positionSwapOrder`, replayed round by round.
  - Other divisions follow `swissTable` with the division's tie-breaks.
- **Movement:** the change in position compared with the replay up to the previous round.

**Data support:** fully supported. Matches without a round number can't be placed in a round column.

## Riverside-only pilot
- Add two separate pilot feature keys: `tournament_pool_matrix_view` and `tournament_swiss_progression_view`.
- Both are switched on for Riverside only. Every other club, including Uitsig, keeps today's view unchanged.
- The view shown depends on each division's format:
  - round-robin or pool divisions get View A
  - Swiss divisions get View B
  - other formats keep the current standings
- A "Classic view" option stays available during the pilot.
- Both are display changes only: no results, pairings, bookings or messages are touched.
- Testing uses made-up players in a Riverside test tournament, then your sign-off, before any staged rollout.

## Still needed before building
**View A (pool grid)**
1. How player numbers 1..N are assigned.
2. The score shown in a grid cell: game score, points, or W/L.
3. What "Total Games" counts: games won, or games won minus games lost.
4. Rank tie-breaks: confirm the current division rules apply.
5. Should the order-of-play table follow the standard rotation (1v5, 2v3, 4v6...), or the actual schedule order?
6. Should the "Venue" column only appear when there is more than one venue?

**View B (Swiss)**
1. SportyHQ screenshots, on phone and desktop.
2. What a round cell shows.
3. Byes and walkovers: count as wins? Do they move position?
4. Withdrawals: does the player stay on the table, greyed out, or keep their spot?
5. During a round: show live movement, or only after the round is complete?

**Both**
- Do players see the new views as well, or only admins at first?

## Risks
- **Older tournaments:** matches with no round number, or pools with no saved player numbers, fall back to the classic view.
- **Incomplete matches:** shown as pending. Nobody moves, and no grid cell fills, until the result is confirmed.
- **Withdrawals and byes:** a withdrawn player's remaining pool games show as WO. The Swiss rules need your explicit answers above.
- **Ties:** pool ranks use the division's existing tie-breaks. Ties can't happen in position-swap divisions.
- **Several divisions or pools:** each division and pool gets its own grid or table, and players are never mixed between them.
- **Uitsig:** stays on its current live views unless you approve otherwise.

## Technical steps (after approval)
1. Add two pure functions with tests: `poolMatrix(pool, entries, matches)` and `progressionTable(division, entries, matches)`. Tests cover byes, walkovers, withdrawals, pending results, missing round numbers and several divisions.
2. Build two components: `PoolMatrixView.tsx` and `SwissProgressionView.tsx`. Each is chosen per division inside the Standings tab, behind its pilot switch.
3. Add a `useClubBetaFeature(clubId, key)` helper and switch both features on for Riverside.
4. Test end to end at Riverside with made-up players, then get your sign-off before a staged rollout.
