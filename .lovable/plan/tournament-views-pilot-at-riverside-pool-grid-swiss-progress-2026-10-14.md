# Tournament views pilot at Riverside: Pool grid, Swiss progression, Knockout/Monrad bracket

Planning only. No code is written until you confirm the layouts and rules. There are three separate views, each matched to its own format, so that no single design is forced onto every format.

## Shared foundation (what exists today)
- **Tournament page:**
  - `src/pages/ClubChampsView.tsx` (Standings tab)
  - `InlineTournamentStandings.tsx`
  - knockout display parts: `DrawBoard.tsx`, `KnockoutCard.tsx`
- **Shared logic in `src/lib/tournaments/`:**
  - Swiss: `swiss-standings.ts`, `swiss-round-gate.ts`, `src/lib/swiss-pairing.ts`
  - Knockout: `knockout.ts`, `knockout-progression.ts` (round types: knockout / semi_final / final / third_place), `knockout-round-display.ts`, `knockout-sections.ts` (power-of-two sections)
  - Seeding: `seeded-bracket.ts` (`seededOrder`, sizes 4/8/16)
  - Draws and withdrawals: `draw-board.ts`, `active-draw.ts`, `withdraw.ts`, `provisional-playoffs.ts`
- **Match data (`club_champs_matches`):**
  - round and stage: `round_number`, `round_id`, `stage`, `stage_id`, `stage_key`, `stage_label`
  - draw position: `bracket_position`, `section_number`, `pool_id`/`pool_number`, `division_id`
  - byes: `is_bye`, `bye_member_id`
  - result: `forfeit_member_id`, `winner_member_id`, `placeholder_a/b`, `score`, `game_scores`
  - scheduling: `court_id`, `scheduled_date/time`
- **Other tables:** `club_champs_registrations` (seeds, withdrawals) and `club_champs_rounds`.
- **Pilot switch:** `club_beta_features`, where each club can have features switched on one by one. These are off by default and managed by Super Admin.

## View A: Pool grid and order of play (round-robin pools)
Based on the NJSA "Pool Matches" layout.
- **Grid:** Nr, Name, one column per player number (1..N), Total Games, Rank. Cells where a player meets themselves are blacked out, and scores are shown from the row player's point of view.
- **Order of play:** Rd, Order of Play ("1v5"), Result, Score, Day/Time, Venue, Court.
- **Data support:** fully supported by existing data. Player numbers 1..N are worked out from seed order unless you say otherwise.

## View B: Swiss progression table (Swiss events)
- **Columns:**
  - Pos
  - Movement
  - Player
  - Seed
  - R1..Rn, each showing the opponent, W/L and score, or BYE / WO / —
  - P / W / L
  - Games +/-
  - Pts, only when the division isn't position-swap
- **Order:** `positionSwapOrder` for position-swap divisions, otherwise `swissTable` with the division's tie-breaks. Movement compares positions with the previous round.
- **Data support:** fully supported by existing data.

## View C: Knockout / Monrad bracket (SportyHQ reference)
**Main draw**
- The left column lists the slots (1..16), each with:
  - seed in brackets, e.g. "[1]"
  - club or region abbreviation
  - player name
  - BYE where a slot has no player
- Connecting lines lead to the next matches, ending at the final.
- Match labels are shown at each meeting point, e.g. A9..A15.

**Placement brackets below the main draw**
- Smaller brackets labelled "Position 3-4", "5-8", "11-12", "13-16", "15-16" and so on.
- Labels are E/F/G/H, e.g. E5, G3, H1.

**What already works**
- Main-draw slot order: `bracket_position` and `seededOrder`.
- Seeds: the registration seed.
- Byes: `is_bye`/`bye_member_id`, which advance the player automatically.
- Winner progression: `winner_member_id` combined with the round order.
- Third-place matches: the `third_place` round type.
- Sections: `section_number`, so one division can have several brackets.

**Match labels (A9, E5, ...)**
- These are not stored anywhere today.
- Proposal: work them out for display only, with no database change.
  - Each bracket gets a letter (A = main draw, then B, C... in order of the positions being decided).
  - Matches are numbered within each bracket, first round top-to-bottom, then the next round.
- The labels stay the same as long as the bracket's size and positions don't change.

**Monrad / play-through finishing positions**
- I found no dedicated Monrad engine in the code today, only main-draw knockout and the third-place match.
- **Option 1 (preferred):** show only. When a tournament already has placement matches stored as separate stages (`stage_key`/`stage_label`, e.g. "pos_5_8"), the view groups them into placement brackets. No database change is needed.
- **Option 2:** if Riverside needs placement draws *generated automatically* (losers moved down into position brackets), that is a change to the tournament engine.
  - It falls under the Riverside pilot process: audit, then approval, then made-up-player tests, then sign-off.
  - It may need a small addition to record which match feeds which (e.g. "loser of A9 goes to E1"). That would be scoped separately before any database change.

**Bracket layout:** a wide bracket scrolls sideways on phones and shows in full on desktop. A finished match shows its score under the winner, and an unplayed one shows "Winner A9" / "Loser A9" as a placeholder.

## Riverside-only pilot (three separate switches)
- `tournament_pool_matrix_view` (View A)
- `tournament_swiss_progression_view` (View B)
- `tournament_bracket_view` (View C)

Each switch is on for Riverside only, and the view shown depends on each division's format. Every other club, including Uitsig, keeps today's views. A "Classic view" option stays available. All three are display changes only, so no results, draws, bookings or messages change. Each view goes through testing with made-up players at Riverside and then your sign-off before a staged rollout.

## Recommended build order
1. **View B: Swiss progression.** The logic exists and has tests, and it is what Riverside needs first.
2. **View A: Pool grid.** It uses existing round-robin data, so the risk is low.
3. **View C, display part:** main draw, byes, seeds and match labels, plus placement brackets wherever placement matches already exist as stages.
4. **View C, engine part (only if needed):** automatic Monrad / play-through placement draws. This needs its own audit and approval.

## Still needed before building
**View A:** how player numbers are assigned; what a grid cell shows; what "Total Games" counts; tie-breaks; whether order of play follows the standard rotation or the actual schedule; when to show the Venue column.

**View B:** SportyHQ screenshots of the progression table; what a round cell shows; how byes and walkovers count; how withdrawals are shown; whether to show live movement or update after each round.

**View C:**
- Should every match decide a finishing position (full Monrad, 1-16), or only selected position brackets?
- Which positions are played out?
- Should consolation be first-round losers only, or every loser?
- Confirm the label lettering. Must it match SportyHQ exactly, or just stay consistent?
- Which metadata columns to show: club, region, country flag, ranking?
- Can a withdrawal after the draw is made be shown as a walkover, or must the player be removed?

**All views:** do players see the new views as well, or only admins at first?

## Risks
- **Older tournaments:** missing round numbers, bracket positions or stage keys mean that view falls back to the classic one.
- **Incomplete matches:** shown as pending or placeholders. Nothing moves forward until the result is confirmed.
- **Byes:** the player moves through automatically, the bye is never counted as a played match, and the BYE is shown in the bracket.
- **Withdrawals:** shown as walkovers. Completed results are never rewritten.
- **Ties:** pool ranks use the division's tie-breaks, and ties can't happen in position-swap divisions or knockouts.
- **Several divisions or sections:** each division, pool or section gets its own grid, table or bracket, and players are never mixed between them.
- **Labels:** if a bracket is regenerated, display-only labels may renumber. This is acceptable until you need labels printed on match sheets.
- **Uitsig:** stays on its current live views unless you approve otherwise.

## Technical steps (after approval)
1. Add pure functions with tests:
   - `progressionTable(...)`
   - `poolMatrix(...)`
   - `bracketModel(division, entries, matches)`, which returns slots, rounds, labels and placement groups
2. Tests cover byes, walkovers, withdrawals, pending results, missing round numbers and several divisions or sections.
3. Build three components (`SwissProgressionView`, `PoolMatrixView`, `BracketView`), each chosen per division and behind its own switch.
4. Add a `useClubBetaFeature(clubId, key)` helper and switch the features on for Riverside one at a time.
5. Test end to end with made-up players and get your sign-off for each view.
