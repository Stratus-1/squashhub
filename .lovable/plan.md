# Riverside tournament calendar: safe Move / Swap pilot

## Scope and feasibility
**Feasible, but not safe to implement as a drag-only addition.** A move must keep the match schedule, court booking and tournament reservation consistent. Swaps need one all-or-nothing operation, not two separate saves.

This is a read-only audit and plan. No app code, database records, results, bookings, permissions or switches changed; no migration or publishing. The scoring initialization defect remains the first release gate. Approval of this plan does not authorize changes to real fixtures or operation of hardware.

## Audit findings
- **Schedule ≠ booking.** Calendar reads match dates/times/courts, not full availability. Riverside-wide read-only audit: 130 fixture rows, 129 with date/time/court, zero linked booking IDs (multiple tournaments, including synthetic). Empty calendar space is not proof of a free court; scheduled fixtures are not proof of reservations.
- **Single-match scheduler is only partly reusable.** `self_schedule_champ_match` atomically updates booking + fixture and checks court/booking conflicts, but permits participants, does not explicitly block LIVE or enforce deadlines, and emits direct notifications. Do not call it unchanged for this feature.
- **Existing swap is unsafe here.** `SwapFixtureButton` performs sequential client updates and best-effort rollback, never updates bookings, and permits conflict overrides. Calendar needs a separate atomic commit path; do not change unrelated swap flows in this task.
- **Legacy holds lack exact tournament ownership.** Recognition relies on championship labels and no participants. Saved courts/day schedules are configuration, not reservations. Ambiguous holds must not be claimed or cancelled.
- **Windows differ.** Existing play-by booking allows after-deadline scheduling with a warning. Fixed centrally managed slots, linked player bookings and explicit deadlines must remain distinct; stricter new-pilot checks must not alter legacy player scheduling.
- **Concurrency is not established.** Bookings have an overlap trigger and unique same-start index, but these alone do not prove safety for concurrent overlapping inserts at different starts. Availability must include unbooked fixtures and all categories/tournaments, not only bookings.
- **Permission is not scoring access.** Current backend has `can_manage_tournament` and club `champs` permission helpers; members/participants can also score. Captain role, scoring access and pilot switches are not move authority. A separately appointed organizer model was not established.
- **Refresh is reusable.** Scoped match updates patch the query, Riverside polls every five seconds, and marker presence is separately subscribed/polled. Retain historical FINAL calendar events and refresh List/Calendar/Progression/open details.

## Priority gate: saved-score initialization
**Exact Android failure: UNRESOLVED.** Riverside has a 20-second error/Retry timer, rejection cleanup and proposed-ID guard. Previous checks covered Upcoming and stalled-read recovery, not the owner's exact grid/native Android path. The timer covers the entire operation, including later lookups; some requests lack abort signals, so transport cleanup needs checking. Missing club context, repeated effect restarts or stale route/config are hypotheses, not proven causes.

Before rescheduling development, obtain the failing URL or screen recording; reproduce exact grid vs Upcoming routes signed in on desktop/mobile/Android without entering points or taking over a real marker. Trace fixture/tournament IDs, auth and pending reads. Test bounded error/Retry, Back/reopen, context hydration, preserved scores and proposed-ID rejection, including stalled reads/repeated mounts. Require owner confirmation of recovery. No fresh Riverside marker lock existed at audit time; three in-progress rows do not establish active marking. Uitsig receives checks, not changes.

## Intended interaction
Keep tournament selection and the three existing tabs; moves belong in Fixtures Calendar. Authorized desktop users get a drag handle separate from pan/zoom/card tap. Mobile/keyboard alternative: **Move match → choose date/time/court target → review → confirm**.

Targets use text/icons plus colour: **Free**, **Reserved for this tournament**, **Same-tournament swap candidate**, **Unavailable / ownership unknown**. Dragging never saves. Confirmation lists both matches' full names/category/duration and old/new date/time/court, booking consequences and notification channels. Changed availability rejects and refreshes the preview; Cancel changes nothing.

## Validation and protection rules
- Only existing, eligible fixture UUIDs in the selected Riverside tournament may move. No cross-tournament swaps, external booking swaps, byes, cancelled/decided fixtures, LIVE/COMPLETED matches or past target starts.
- Check saved in-progress state, recorded ongoing scoring and fresh marker locks, not scheduled time alone. Coordinate schedule commit with marker acquisition so marking cannot begin in a race between validation and saving.
- Validate each match's full duration using its applicable pool/category/stage settings and linked booking. Missing/conflicting duration or window information blocks the move; never invent it. Use club-local dates/times and real current time.
- Check active court eligibility, tournament dates and saved allowed day/time windows. Only explicit play-by rules impose a deadline; moving a fixed fixture must not turn it into play-by or erase an existing deadline. Respect round/stage ordering and configured rest. Ambiguous constraints block until clarified.
- Check all overlapping club bookings, imported external bookings, other tournaments and every category/pool—not just currently filtered calendar cards. Validate singles/doubles participants and shared person identities without conflating different family members using one login. An unavailable external availability service means “availability unknown,” not free.
- A genuinely free slot is eligible only inside the saved tournament scheduling envelope and when confirmation explicitly authorizes any required new reservation. An owned hold is usable only with proven tournament ownership and sufficient duration; preserve unused portions and old reservation capacity.
- Swap validates BOTH resulting schedules, excluding only the two legitimately displaced allocations. Different durations must fit independently; a swap is not automatically valid because start times exchange.
- Proposed positional TBD preview slots remain view-only and cannot become marker targets or bookings. Persisted synthetic positional fixtures with unknown players need a separate later policy: first pilot excludes them because player-clash validation is incomplete. No engine conversion or fixture creation in this feature.

## Phased pilot and approval gates
### 0. Resolve marker loading — first
Complete the priority checks above. Calendar write development remains blocked until this gate is passed.

### 1. Read-only Move / Swap preview
After approval, implement a shared validator and target preview behind a separate Riverside-only, fail-closed switch. No writes, reservations or notifications. Use local synthetic scenarios; inspect live availability read-only. Review desktop/mobile targets, confirmation and rejection reasons with the owner.

### 2. Safe backend operation in an isolated test environment
Requires separate approval for any additive backend changes and test records. Implement authenticated preview/commit, atomic move/swap, reservation ownership, audit and notification outbox. Use synthetic fixtures and bookings where hardware/provider/message delivery cannot run; a synthetic tournament on the shared live backend is NOT sufficient isolation because booking triggers can schedule lights and send notifications.

### 3. Riverside real-fixture opt-in
Separate owner sign-off on the tested operation and the specific tournament. Start with single moves into clearly owned slots; then enable validated swaps. Permit genuinely free slots only after reservation behaviour is approved. Keep rollback/recovery available through a new validated reverse operation, never direct edits. No bulk moves, automatic rescheduling, scoring changes or positional conversion.

### 4. Broader rollout — outside this approval
Uitsig and every other club remain unchanged until explicitly approved. Publishing always requires an explicit request.

## Technical design and evidence
- Reuse `FixtureCalendar`, `ClubFixturesPilot`, `Tournaments`, the shared viewer, `fixture-scheduling.ts`, `self-schedule.ts`, `bookable-courts.ts` and saved round/stage rules. Do not use `SwapFixtureButton` for commit.
- Live schema was inspected: `club_champs_matches` owns schedule/result/identity; `bookings` owns physical occupancy; rounds/stages own constraints; `champ_marker_locks` owns marker presence. Current backend permissions supersede old migration assumptions.
- Preview/commit accept tournament/fixture IDs, target or swap, expected version/schedule snapshots and an idempotency key. Derive actor from validated auth; server-check management permission and Riverside scope on both calls.
- One transaction locks matches/bookings and affected court/day allocations deterministically, revalidates everything, applies both schedules/bookings, and writes audit + notification outbox. Full rollback on failure; preserve IDs, results, participants and unrelated allocations. Conflict protection must coordinate normal booking writers and marker acquisition, not just this operation.
- Do not call the scheduler twice or weaken global overlap guards. Approve the locking/exclusion approach and any additive schema changes separately. Preserve reservation leftovers and old-slot capacity without cancelling ambiguous holds.
- Dispatch after commit through Communications engine and approved tournament messaging settings, deduplicated/retryable. Result-notification settings are not schedule consent. Delivery failure does not undo a committed move; prevent duplicate legacy notifications.
- Review booking triggers for cancellation penalties, lights, access, reminders and external sync. Isolated tests must block hardware/provider/message actions; if isolation is unavailable, write testing stays blocked.

## Tests and acceptance
**This audit:** 45 existing tests passed across marker deadline, calendar scores, fixture scheduling/display/split and club fixtures. Non-failing warnings: dialog description and JSDOM scrolling. No new drag/swap implementation or end-to-end commit was tested.

Future coverage: free/owned/ambiguous/external targets; every category and other tournament; unequal durations and partial overlaps; deadlines/windows/past time; singles/doubles identity and rest; live/final/marker races; wrong-club/unauthorized callers; stale preview/two admins/normal booking race; timeout then idempotent retry; forced mid-swap failure with complete rollback; reservation preservation; notifications once after commit; no hardware calls; List/Calendar/Progression consistency and finals retained; desktop drag vs pan/zoom and keyboard/mobile alternative; Uitsig unchanged.

**Acceptance:** both match and booking schedules read back consistently, no overlaps or lost holds, all result fields unchanged, audit identifies actor and before/after slots, realtime views agree, and owner signs off before real activation.

## Blockers and decisions for review
- Exact Android initialization failure still needs its failing entry URL/recording and verification.
- Legacy hold ownership, effective durations/windows and external availability must be provable before target eligibility.
- Isolated write-testing environment must prevent real messages, provider actions and hardware schedules.
- Confirm whether “organizer” means existing `champs`/tournament management permission or a separately appointed per-tournament organizer; no new role is assumed.
- Confirm genuinely free-slot reservation policy; recommendation: start with proven tournament-owned slots and introduce new reservations only after that phase is signed off.
