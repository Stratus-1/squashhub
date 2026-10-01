# Mixed scheduling: play-by dates for pools, booked dates and courts for chosen play-off rounds

## What the owner sees
In the tournament date setup, the single "How are games scheduled?" choice becomes one choice per stage:

1. **Opening (pool) rounds**: "Players book by a date" or "Organiser books courts" (same as now).
2. **Play-off rounds**: one line for each play-off round that applies (e.g. Quarter-finals, Semi-finals, Final, 3rd/4th). Each line has its own switch:
   - **Play by date**: one "play by" date. Players arrange the game themselves.
   - **Fixed date & courts**: a date, a start time and the courts in use. Games get a court and time.
3. Quick presets above the play-off lines so the owner doesn't have to set every line:
   - "Same as pool rounds" (default)
   - "Only the final on a fixed date" (the final and 3rd/4th get fixed date and courts, the rest are play by)
   - "All play-offs on fixed dates"
   The owner can still change any single line after picking a preset.
4. A 3rd/4th play-off follows the final's setting and date unless the owner changes it.

What members see:
- Play-by games: "Play by Sun 19 Oct". Players book the court themselves.
- Fixed games: "Sat 30 Oct · Court 2 · 18:00". The club books it, so there's no prompt to book.
- Not set yet: "Date to be set".

## Rules
- A play-off round can't be dated before the last opening round.
- Courts and times only appear on rounds set to "Fixed date & courts".
- Marking and scoring stay the same. Only scheduling, booking prompts and labels change per game.
- Existing tournaments keep working: if nothing is saved per stage, every stage uses the current tournament-wide setting.

## Technical section
- **Data**: add `tournaments.stage_scheduling jsonb` (nullable), with the same column on `club_champs` if the setup saves there. Shape: `{ opening: "self"|"club", playoffs: { [playoffKey]: { mode, date, start_time, court_ids } } }`. Fall back to `scheduling_mode` when it's null. The migration includes the column only; no RLS or grant changes, because the tables already exist.
- **Pure logic** in `src/lib/tournaments/round-plan.ts`:
  - `stageModeFor(game, stageScheduling, schedulingMode)` returns `"self"|"club"`.
  - `applyPlayoffPreset(preset, playoffKeys)`
  - Validation (date order, and courts required when the mode is club).
  - Tests go in `src/test/round-plan.test.ts`.
- **Setup UI**: `CentralRoundSchedule` gets a per-play-off-row mode toggle, preset buttons, and date/time/courts inputs for fixed rows only. `ClubChampsTab` saves `stage_scheduling`.
- **Per-game mode**: these places switch from the tournament-wide `scheduling_mode === "self"` check to `stageModeFor(...)`:
  - `round-control.ts`, which decides between "Set dates & courts" and awaiting results
  - `Tournaments.tsx`, around lines 880 and 1271
  - `ClubChampsView.tsx`, around lines 1848 and 3292–3342
  - `knockout-progression.ts`, where generated rounds should use their stage's mode
- **Play-off generation**: stamps the round's date, and also its court and time when that round is fixed. Courts are assigned across the selected courts from the start time, using the tournament's match duration.
- **Not changed**: scoring, tie-breaks, standings, Diamond League, and other clubs' live events. Preview only until you say publish.
