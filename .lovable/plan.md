# Simple dates in the Tournament Builder: one schedule, set after pools

## The idea
Build the pools and divisions first. Then set the dates once for the whole tournament. The app already knows how many rounds the pools need, so it creates the rounds and gives each one a date.

## What the owner sees
1. **Design / Players steps**: there are no date boxes on divisions or stages. Each stage shows "Dates set on Schedule".
2. **Schedule step**: one short form for the whole tournament.
   - **First round on**: a date, such as Wed 7 Oct. The weekday comes from this date.
   - **How often**: Weekly (default) or every 2 weeks.
   - **Pool games are**: "Played by this date" or "Played on this date (fixed)".
   - **Play-offs start on**: suggested as the week after the last pool round. The owner can change it.
   - **Play-offs are**: "Played by this date" or "Played on this date (fixed)". Fixed play-offs also ask for a start time and courts.
3. Below the form, a read-only list that the app works out:
   ```text
   Round 1      Wed 7 Oct   play by
   Round 2      Wed 14 Oct  play by
   Round 3      Wed 21 Oct  play by
   Semi-finals  Wed 28 Oct  fixed · 18:00 · Courts 1–2
   Final        Wed 4 Nov   fixed · 18:00 · Court 1
   ```
   The number of rounds is the largest number any division needs. If divisions need different numbers, a division with fewer rounds simply finishes early. A short note says so.
4. The tournament's first and last day are filled in automatically from this list. Nobody types them in.
5. If the pools change later (for example, fewer pools), the list updates by itself.

## Removed
- Per-stage and per-division date windows ("Use tournament dates", "inh.").
- The "Extend tournament to…" date warnings. These can't happen any more, because the end date is worked out.

## Rules
- Play-offs can't start before the last pool round.
- Existing drafts: if a draft has old stage dates, its first stage date becomes "First round on" and the weekly pattern is applied. Nothing else is lost.
- The normal (non-beta) tournament setup is not changed.

## Technical section
- `definition.ts`: add `scheduleDefaults.plan = { firstRound, everyWeeks, poolMode: "play_by"|"fixed", playoffStart, playoffMode, startTime?, courtIds? }`. Stage `schedule` dates become derived rather than edited.
- New pure function `buildRoundCalendar(def)` in `src/lib/smart-builder/dates.ts`. It uses `openingRoundsNeeded` / `playoffRoundsFor` from `round-plan.ts` and returns the round list. It also writes the derived `startDate`/`endDate` and each stage's `roundDates`/mode, so the validator and `toExistingTournament` keep working without changes.
- `DateControls.tsx`: remove `StageWindowControl` and replace `TournamentDatesCard` with a `ScheduleForm` plus the read-only round list. Remove the stage date inputs from the Design/Players stage editors.
- Mapping to the real tournament: pools map to round dates with `scheduling_mode`. Play-offs map to `milestone_play_by` and `stage_scheduling` (the mixed-scheduling format already built).
- Tests: add calendar tests to `src/test/smart-builder.test.ts` (3-round pools, weekly Wednesday, fixed final, legacy draft migration).
- Preview only, not published.
