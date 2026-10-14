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
- Existing eligible UUID fixtures only, same selected Riverside tournament. Block unauthorized users, LIVE/COMPLETED/decided/cancelled matches, byes and past starts. Check saved scoring and fresh marker locks, never time alone; interlock commit with marker acquisition.
- Validate full duration from linked booking and saved pool/category/stage settings, active eligible courts, tournament dates/windows, round order and configured rest. Missing/ambiguous information blocks rather than invents. Use club-local time. Enforce explicit play-by deadlines without converting fixed fixtures to deadlines or changing legacy player scheduling.
- Check overlapping bookings/imported external occupancy AND unbooked fixtures across all categories and tournaments. Check singles/doubles participants and shared person identities without conflating family members sharing a login. Unavailable external checks mean availability unknown.
- Free slots must lie inside the saved tournament envelope; confirmation separately authorizes any required reservation. Own holds require proven ownership/full duration; preserve unused hold portions and old capacity. Ambiguous/external holds are blocked.
- Swaps validate both resulting schedules/durations, excluding only the two displaced allocations. Different durations must each fit. No cross-tournament/external-booking swap.
- Proposed positional TBD slots remain read-only, never marker IDs/bookings. First pilot also excludes persisted synthetic TBD fixtures because player-clash validation is incomplete. No fixture creation or positional engine conversion.

## Phased pilot and approval gates
**0 — Resolve marker loading first.** Complete the exact-path recovery checks and owner confirmation; rescheduling development remains blocked.

**1 — Read-only preview, after approval.** Riverside-only fail-closed switch, shared target validator, desktop/mobile Move/Swap review. Local synthetic scenarios and live availability inspection only; no reservations, writes or messages. Owner reviews targets and confirmation.

**2 — Atomic operation in isolated tests, separately approved.** Any additive backend changes/test records need approval. Build authenticated commit, reservation ownership, audit and outbox. Synthetic fixtures on the shared live backend are not sufficient isolation: booking triggers may schedule lights/send notifications. No testing unless provider/hardware/messages are prevented.

**3 — Explicit real-tournament sign-off.** Riverside opt-in only. Start with single moves into proven owned slots, then swaps; free-slot reservations require separate policy approval. Reverse changes only through a freshly validated operation. No bulk moves, scoring changes or automatic rescheduling.

**4 — Broader rollout is not authorized.** Uitsig/other clubs remain unchanged. Publishing requires an explicit request.

## Technical design and evidence
- Reuse `FixtureCalendar`, `ClubFixturesPilot`, `Tournaments`, the shared viewer, `fixture-scheduling.ts`, `self-schedule.ts`, `bookable-courts.ts` and saved round/stage rules. Do not use `SwapFixtureButton` for commit.
- Live schema was inspected: `club_champs_matches` owns schedule/result/identity; `bookings` owns physical occupancy; rounds/stages own constraints; `champ_marker_locks` owns marker presence. Current backend permissions supersede old migration assumptions.
- Preview/commit accept tournament/fixture IDs, target or swap, expected version/schedule snapshots and an idempotency key. Derive actor from validated auth; server-check management permission and Riverside scope on both calls.
- One transaction locks matches/bookings and affected court/day allocations deterministically, revalidates everything, applies both schedules/bookings, and writes audit + notification outbox. Full rollback on failure; preserve IDs, results, participants and unrelated allocations. Conflict protection must coordinate normal booking writers and marker acquisition, not just this operation.
- Do not call the scheduler twice or weaken global overlap guards. Approve the locking/exclusion approach and any additive schema changes separately. Preserve reservation leftovers and old-slot capacity without cancelling ambiguous holds.
- Dispatch after commit through Communications engine and approved tournament messaging settings, deduplicated/retryable. Result-notification settings are not schedule consent. Delivery failure does not undo a committed move; prevent duplicate legacy notifications.
- Review booking triggers for cancellation penalties, lights, access, reminders and external sync. Isolated tests must block hardware/provider/message actions; if isolation is unavailable, write testing stays blocked.

## Tests and acceptance
**Audit checks: 45 existing tests passed** (marker deadline, calendar scores, scheduling/display/split, club fixtures). Non-failing warnings: dialog description and JSDOM scrolling. No new Move/Swap or commit flow tested.

Future tests: free/owned/ambiguous/external targets; all categories/tournaments; unequal durations/partial overlaps; deadlines/windows/past starts; doubles/person clashes/rest; live/final/marker races; unauthorized/wrong-club callers; stale preview/two admins/normal booking race; timeout/idempotent retry; forced mid-swap rollback; preserved holds; one post-commit notification; no hardware; consistent List/Calendar/Progression/finals; desktop drag vs zoom and mobile/keyboard; Uitsig unchanged.

Acceptance: both match and booking read back consistently; no overlaps/lost holds; results unchanged; before/after audit identifies actor; views agree; owner signs off before activation.

## Blockers and decisions for review
- Exact Android initialization failure still needs its failing entry URL/recording and verification.
- Legacy hold ownership, effective durations/windows and external availability must be provable before target eligibility.
- Isolated write-testing environment must prevent real messages, provider actions and hardware schedules.
- Confirm whether “organizer” means existing `champs`/tournament management permission or a separately appointed per-tournament organizer; no new role is assumed.
- Confirm genuinely free-slot reservation policy; recommendation: start with proven tournament-owned slots and introduce new reservations only after that phase is signed off.
