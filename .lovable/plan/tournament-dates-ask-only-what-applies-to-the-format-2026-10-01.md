# Tournament dates: ask only what applies to the format

## Naming (answer to the question)
- **1st v 1st, 2nd v 2nd across pools** = **Position (placement) play-offs** — every qualifier plays one match for a final place.
- **1st Pool A v 2nd Pool B, 1st Pool B v 2nd Pool A** = **Crossover play-offs** (crossover semi-finals). Winners meet in the final, losers in 3rd/4th.
- **Seeded draw from all qualifiers (1 v 8, 2 v 7 …)** = **Knockout**.

These three names are shown in setup with a short example under each.

## 1. Choose how games are scheduled (one choice, asked first)
- **Organiser books courts** — every round has a date, and each game gets a court and time.
- **Players book by a date** — every round has a "play by" date; players book their own court.

## 2. Opening rounds (pool / league stage)
- The app works out the number of rounds from the players per pool (4 players = 3 rounds, 5 = 5 rounds with a bye, double round robin = twice).
- It shows: "Your pools need 3 rounds." The organiser can change it, but gets a warning if the number doesn't match ("4 players only need 3 rounds — round 4 would be empty").
- One line per round:
  - Organiser books: **date + courts used that evening** (court numbers next to each week).
  - Players book: **play-by date**.

## 3. Play-off rounds (generated from the chosen play-off type)
Only the rounds that type really has are shown. There are no optional quarter-final/semi-final fields when they can't happen.

```text
Position play-offs      -> 1 round: "Place play-offs"
Crossover (2 pools)     -> Semi-finals, Final (+ 3rd/4th, same date as final)
Knockout, 8 qualifiers  -> Quarter-finals, Semi-finals, Final
Knockout, 4 qualifiers  -> Semi-finals, Final
None                    -> nothing asked
```
Each play-off round gets a date, plus courts when the organiser books courts. Rounds must come after the last opening round.

## 4. Fixes that come with it
- Play-off games take the date of **their own play-off round**. They never borrow a pool round's date. With no date set, they show **"Date to be set"**.
- The "games played" count per round counts only that round's games.
- Games are only created for rounds defined here, so nothing is ever guessed.

## 5. Riverside test event ("Ckub champs 2026")
- Remove the 12 unplayed play-off games and create them again from the corrected standings, with the new play-off dates.
- Then run a full test tournament from start to finish in the preview: setup, draw, results, standings, play-offs and dates. This happens before Uitsig uses it.

## Technical details
- New pure module `src/lib/tournaments/round-plan.ts`: `openingRoundsNeeded(poolSizes, format)`, `playoffRoundsFor(playoffType, qualifiers)`, and validation, with tests in `src/test/round-plan.test.ts`.
- `CentralRoundSchedule.tsx` is driven by the round plan. The fixed QF/SF/F `MILESTONE_KEYS` grid is replaced by the generated play-off rounds, and an optional `courtIds` is added on each round entry (`RoundDeadline`) when the organiser books courts.
- `round-definitions.ts` `deadlineForStage`: the fallback to the round number is removed for play-off stages, so it returns null ("Date to be set").
- Play-off generation writes the play-off round's date onto each game (`club_champs_matches` play-by/scheduled date).
- Existing tournaments keep their saved milestone dates. These are mapped onto the new play-off rounds when they load, so no saved data is lost.
- Smart Builder dates (`dates.ts`) reuse the same round plan, so both setups agree.

## Not changed
Scoring, tie-breaks, the standings fix that is already in the preview, and other clubs' live events.
