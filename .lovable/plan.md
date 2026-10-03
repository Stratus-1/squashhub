# Tournament scheduling: architectural assessment and consolidation plan

## Short answer

No. SquashHub has no single scheduling service that every way of creating games goes through. There are at least **seven separate scheduling paths**, each with its own rules for dates, times, courts, game length and capacity. Each fix so far (Semifinal/Final, stage courts, the 6th/7th League session timing) added or patched one of these paths. The failures keep coming back because each new tournament type uses a path that hasn't been fixed yet.

## 1. Current rules, by concern

| Concern | What happens today |
|---|---|
| Date source | Three different sources: the Current Builder's play days / per-day schedule; the Step-by-Step stage plan (`roundDates`, the stage date, or play-off step dates in `format_plan.stages`); and `milestone_play_by.stage_scheduling` for the older play-off settings. When saving the draw, round 1 falls back to the stage date but later rounds do not (`structured-persist.ts` `roundDate`). |
| Start/end time | Current Builder: global start/end or per-day overrides. Step-by-Step round robin: `format_plan.days[].windows`. Play-off steps: each step's own `from`/`to`. Older play-offs: `start_time` with no end time. |
| Game/slot length | `match_duration_minutes` almost everywhere (default 45, or 30 for Bells). The Bells time cap set in the Step-by-Step builder is planning-only on the device and never reaches the server; `court-allocation.ts` explicitly says scoring never sets the length. Only the Current Builder uses per-league/per-pool lengths and breaks. |
| Courts per stage | Step-by-Step play-off steps: their own selected courts (fixed after the Court 4 bug). Round robin: the plan day's courts. Older play-offs: `court_ids` on the play-off plan. Current Builder: chosen courts, or per-day courts. The draw-saving check only confirms a court is one of the tournament's selected courts, not one of that stage's. |
| Court/time clashes | Checked in the play-off step scheduler, the round-robin session timing, `schedulePlannedPlayoffGames` (via the booking RPC), and the Current Builder's own scheduler. Not checked in `assignFixedSlots` (older play-offs). |
| Player clashes / rest | Only the Current Builder (back-to-back / rest check in `ChampSchedulePreview` and its scheduler). **None** of the Step-by-Step or play-off allocators check that one player isn't on two courts at once or playing back-to-back. |
| Capacity | Calculated separately by the play-off step allocator (`planFormalStageSlots`), the session timing (`planTimedRounds`) and the Current Builder. When the first draw is generated, the warning appears after the games are already saved. `assignFixedSlots` has no capacity check and runs past the end of the window. |
| Organiser-scheduled vs play-by vs decide later | Detected separately in three places: `formal-stage-schedule.ts` (mode on the play-off step), `round-plan.ts` `stageModeForGame` (older stage scheduling), and `stage-schedule.ts` / `fixture-scheduling.ts` (how the game is shown and who may reschedule). |
| Several dates | Play-by: `roundDeadlines` splits rounds across dates. Fixed: `roundDates` is used only when it has one date per round; otherwise rounds after round 1 get no date. |
| Category order | Only the play-off step allocator (`orderForSlots`: last category first) and `playoff-slot-order.ts`. Round robin and the Current Builder don't apply it. |
| Rescheduling | One shared path: `ScheduleMatchDialog` and the `self_schedule_champ_match` RPC, with permissions from `fixture-scheduling.ts`. This is the only part that is genuinely shared. |
| Not enough capacity | Varies: blocks (Knockout Rounds panel confirm), warns after saving (Generate draw), leaves games TBD (`assignFixedSlots`, round dates), or reports games it couldn't place (`schedulePlannedPlayoffGames`). |

## 2. Ways games are created, and which scheduling logic each uses

| Path | Where games are created | Scheduling used |
|---|---|---|
| Current Builder round robin / pools / Bells / rotating doubles | `ClubChampsTab.tsx` `schedulePreview` (inline, about 300 lines) | Its own session scheduler (per-day courts, player rest) |
| Step-by-Step round robin, pools, cross-league | `generateStructuredTournament` in `structured-persist.ts` | Date only (round 1); then `allocateAllFixedStages` → `scheduleTimedRounds` (added in the last change) |
| Step-by-Step knockout rounds and formal Semifinal/Final | `StepKnockoutRoundsPanel.tsx` | `planStageFromDb` / `scheduleFormalStage` |
| Mapped play-off stages | `StageProgressPanel` / `StructuredEnginePanel` → `schedulePlannedPlayoffGames` | Its own slot planner plus the booking RPC (creates bookings) |
| Older play-offs (Club Champs view) | `ClubChampsView.tsx` → `assignFixedSlots` | Fills courts round-robin from a start time; no end time, clash or capacity check |
| Knockout progression (next round) | `knockout-progression.ts` | Sets `play_by: null`, no scheduling |
| Diamond League | `diamond-fixtures.ts` `syncDiamondFixtures` | Its own court/time from the Diamond weeks |
| Rebuilding / unplayed games | `preserve-schedules.ts` | Keeps player bookings; doesn't re-run any allocator |
| Manual add slot / swap / move / free a slot | `Tournaments.tsx` | Inline checks for player clashes and back-to-back games, separate from everything else |
| Repair after setup changes | `reconcileFixedStages` | Play-off step allocator only |

## 3. Why each failure happened

- **Fixed-date Semifinal/Final became TBD with Book court.** Formal-stage confirmation inserted games through the knockout path, which has no scheduling step. Whether a stage was organiser-scheduled was decided in display code, so these games looked like player-booked games.
- **Final used Court 4.** The allocator took courts from a shared or tournament-wide list instead of the stage's own list. The only check when saving is "one of the tournament's selected courts", which Court 4 passed.
- **Cross-league fixed rounds got a date but no time or court.** `generateStructuredTournament` only stamps dates, and only for round 1 when `roundDates` has a single date. No allocator handled non-play-off fixed stages until the last change.
- **Bells rounds got no sequential bell times.** No path treated a round as one simultaneous bell. The Bells cap is planning-only on the device, so the server only sees `match_duration_minutes`.
- **Stage settings leaked between stages.** Three separate stores (`milestone_play_by.stage_scheduling`, `format_plan.stages`, `builder_spec` stage `schedule`) and several fallbacks (stage date → round 1, tournament courts → stage, older default mode). Each reader picks a different source.

## 4. Proposed general scheduling contract

Every path that creates or confirms games must call one service with a list of planned games, and get back either a full assignment or a refusal with a reason:

1. **Mode** is decided per round/stage by one function: `fixed` | `play_by` | `decide_later`. Every caller uses it.
2. **Fixed:** every game gets a date, a start time and one of that stage's courts, or nothing is written and the organiser sees a capacity message (needed vs available).
3. **Play by:** no court/time, the round's deadline is set, and players can book.
4. **Decide later:** deliberately unscheduled, with no deadline invented.
5. **Resources are per round/stage:** its own dates, time windows and courts. No fallback to club courts, another stage or round 1.
6. **Game length** comes from the actual play format: the Bells cap plus changeover, or the tie/match minutes. The Bells cap must be saved on the server.
7. **Round shape:** a Bells/simultaneous round starts together (waves only if configured). A normal stage fills slots one after another.
8. **No court clashes** (across tournaments and with bookings) and **no player clashes**, with an optional minimum rest.
9. **Capacity is checked before saving**, inside the same transaction that creates the games.
10. **Category order** is applied where configured (last category first).
11. **Idempotent:** played, started or booked games are never moved; repeating a run gives the same result.
12. **Repair** runs the same service against unplayed, unbooked games only.

## 5. Is one shared service practical?

Yes, and much of it already exists and can be combined:
- **Single source of truth:** `formal-stage-schedule.ts` already has the core pieces (pure slot planner, timed-round planner, stage-specific courts, protection of played/booked games). It becomes `src/lib/tournaments/scheduler/` with one pure `planSchedule()` and one DB `commitSchedule()`.
- **Fold in:** `assignFixedSlots` (retire it), the slot planner inside `schedulePlannedPlayoffGames` (keep the booking-RPC write step, replace the planner), and the date stamping in `generateStructuredTournament` (replace with a call to the service).
- **Reuse:** the player clash / rest check from the Current Builder and `Tournaments.tsx`, extracted into a pure helper; `playoff-slot-order.ts` for ordering; `fixture-scheduling.ts` stays the single source for display and permissions.
- **Leave alone at first:** the Current Builder's inline scheduler and Diamond League. Both work and both are protected engines. Move them over last, behind tests.

**Risks**
- Existing tournaments have mixed stored settings. A read-only adapter must resolve the three stores in a fixed priority order and report conflicts instead of guessing.
- Games already shown to players must not move. Repair only touches unplayed, unbooked games whose slot breaks the contract.
- Saving the Bells cap may need one small schema change (a per-stage minutes field or a `builder_spec` field); `builder_spec` likely avoids a migration.
- Changing the old "warn after saving" into "block before saving" changes what organisers see on Generate draw.
- `schedulePlannedPlayoffGames` creates real bookings and notifications, so its write step must stay as it is.

## Recommended step-by-step plan

1. **One way to read schedule settings (read-only).** `resolveStageResources(champ, stage/round)` returns mode, dates per round, windows, courts, game length and round shape from the three stores, in a fixed priority. Add tests against snapshots of real configurations (NSP Knock out, 6th 7th, the older play-offs).
2. **One planner.** Move `planFormalStageSlots` and `planTimedRounds` into `planSchedule()`, adding player clash/rest checks and the shared capacity calculation. Pure, with the full test set.
3. **One commit step.** `commitSchedule()` is idempotent, never moves protected games and refuses when capacity is short. Generate draw, knockout confirm, formal stage confirm and `reconcileFixedStages` move onto it, with the capacity check before inserting games.
4. **Older play-offs and mapped play-offs.** Replace `assignFixedSlots`; `schedulePlannedPlayoffGames` uses `planSchedule()` and keeps its booking-RPC write.
5. **Save the Bells cap / format length** on the server so game length is authoritative everywhere.
6. **Contract check when saving:** reject any fixed-stage game with no time or court, or with a court not in that stage's list. This is the last line of defence, ideally a database check. **Needs your approval:** this would be a database change.
7. **Later:** move the Current Builder and Diamond League onto the planner behind tests.
8. **Data repair:** run the commit step in dry-run mode across all tournaments, report what it would change, then apply only to unplayed, unbooked games with your approval.

Nothing will be implemented, no tournament data changed, nothing published and no messages sent until you approve.
