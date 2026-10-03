# Diamond League: end-to-end reuse of the existing display and reporting

The Beta is only a new way into the existing Diamond League. Once a Diamond League is created, it must look and behave exactly like today's Diamond League, including the standings the user likes. This plan adds that protection and a check that proves it.

## What is already in place (from the last change)

- The Beta's "Diamond League" button opens the current builder's own Diamond setup. It saves the same tournament and Diamond League records and the same fixtures the current builder does.
- A Diamond League created this way never goes through the Beta's save-and-continue step. So it never gets the Beta's saved format, play-off chain or run overview.

## How today's tournament pages pick the Diamond League display

- **Tournament page (`ClubChampsView`):** loads the tournament's Diamond League record. If there is one, it shows `DiamondStandings` and hides the generic winners, survivors, wooden spoon and pool standings cards.
- **Tournaments list (`Tournaments.tsx`):** keeps a set of Diamond tournament ids and shows `DiamondStandings` for those.
- **`TournamentProgressCard`:** already skips Diamond weeks ("progress lives in the Diamond manager").
- **Structured panels:** `StructuredEnginePanel` and `StageProgressPanel` only appear when the tournament is saved in the structured format. A Diamond League created via the Beta is not, because it is saved the same way the current builder saves it.

So a Diamond League created through the Beta already lands in the Diamond display. Nothing needs restyling.

## Places that could accidentally override the Diamond display

1. **Beta "Continue managing" (`StepTournamentManagement` → `StepRunOverview` → `StageProgressPanel`).** Only tournaments the Beta itself handed over appear there, and Diamond ones are not handed over. Risk: a future change could add Diamond tournaments to that list. Guard: if the tournament has a Diamond League record, show a link to the normal tournament page instead of the run overview.
2. **Beta "Generate draw & fixtures" (`step-draw.ts`).** This would build a second set of structured fixtures and switch the tournament to the structured format, which would replace the Diamond display with generic panels. Guard: refuse when a Diamond League record exists.
3. **`BetaTournamentOperate` page (`/beta-tournament/:id`).** Shows `StructuredEnginePanel` for structured tournaments only. Guard: for a Diamond tournament, send the user to the normal tournament page.
4. **Play-off scheduling, slot order, stage bookings, Beta checks (`playoff-schedule.ts`, `stage-bookings.ts`, `consistency.ts`).** These would book or check generic play-off stages. Guard: do nothing for Diamond tournaments.
5. **Generic tournament-page decisions keyed on structured format or pools.** These are already correct, because a Diamond tournament is not structured. Lock this in with a test so a later change can't flip it.
6. **Old Beta drafts made with the retired Diamond model.** These are generic structured setups, not real Diamond Leagues. They already show the "retired" note and are never shown with `DiamondStandings`. No change needed.

All guards use one shared check, `isDiamondTournament(tournamentId)` (does a Diamond League record exist for this tournament, read-only). The Diamond pages, standings, scoring and progression code are not edited at all.

## What will not change

`DiamondStandings`, `TeamLeagueManager`, the Diamond live summary and position points, Diamond scoring, the doubles seeding trigger, crossover and placing rules, the Diamond fixtures, the Bells marker, the tournament page's Diamond layout and the Tournaments list Diamond view. No existing tournament or result is touched, nothing changes in the database, and nothing is published.

## Tests

- **Display routing:** for a tournament with a Diamond League record, the tournament page shows `DiamondStandings` and none of the generic standings, survivors, wooden spoon or structured panels. The Tournaments list does the same.
- **Guards:** Generate draw, play-off scheduling, stage bookings and the Beta checks refuse or skip a Diamond tournament. The Beta management screen and `/beta-tournament/:id` send the user to the normal tournament page.
- **Unchanged files:** the existing Diamond tests (`diamond-*.test.ts`, `team-league.test.ts`) pass, and the Diamond standings and manager files are unchanged.
- **Riverside preview:** open an existing Riverside Diamond League tournament and confirm the standings look as before. Open a Diamond draft started from the Beta (draft only, no invites sent) and confirm it shows the same Diamond display.

## Technical details

- New `src/lib/tournaments/diamond-guard.ts` with `isDiamondTournament(id)`: a read-only, club-scoped select of `team_league_events.tournament_id`, cached with react-query under the same key `DiamondStandings` uses.
- Guards are early returns in `step-draw.ts`, `playoff-schedule.ts`, `stage-bookings.ts` and `consistency.ts`. `StepTournamentManagement` and `BetaTournamentOperate` show a redirect card instead.
- Add one rule to `src/components/smart-builder/AGENTS.md`: after creation, a Diamond League always uses the Diamond display and reporting, and Beta or structured screens must skip it.
