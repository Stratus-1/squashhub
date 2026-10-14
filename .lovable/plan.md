# Riverside tournament calendar: safe Move / Swap pilot

## Scope and feasibility
**Feasible, but not safe to implement as a drag-only addition.** A move must keep the match schedule, court booking and tournament reservation consistent. Swaps need one all-or-nothing operation, not two separate saves.

This is a read-only audit and plan. No app code, database records, results, bookings, permissions or switches changed; no migration or publishing. The scoring initialization defect remains the first release gate. Approval of this plan does not authorize changes to real fixtures or operation of hardware.

## Audit findings
1. **Calendar and court bookings are separate.** The calendar reads saved tournament match dates/times/courts, not full court availability. The current Riverside-wide audit found 130 saved match rows, 129 with date/time/court, and **zero linked booking IDs**. This includes multiple tournaments and synthetic fixtures, not just Club Champs. An empty calendar space is therefore not proof of a free court; a scheduled match is not proof of a reserved court.
2. **Existing single-match booking is reusable only in part.** It checks eligible courts and active booking overlaps, updates a linked booking and fixture in one transaction, and can release/restore championship holds. But it allows participants as well as admins, does not explicitly block live matches or enforce play-by deadlines, and sends direct notifications. It cannot be used unchanged for the proposed admin-only feature.
3. **Existing Swap Fixture is unsafe for this use.** Its client-side sequential updates change match dates/times/courts without updating bookings. Rollback is best-effort; it is not atomic. Do not wire calendar drops into that action or silently broaden this task into changing it elsewhere.
4. **Reservation ownership is ambiguous in legacy data.** Existing championship holds are recognized by a label and absence of participants, not an exact tournament link. Selected courts and saved day schedules are permission/configuration, not actual reservations. An ambiguous hold must not be treated as this tournament's available space or cancelled automatically.
5. **Deadline and fixed-slot semantics differ.** Existing player scheduling permits an after-deadline booking with a warning. Fixed centrally managed slots, player-linked bookings and explicit play-by rounds must remain distinct. The new pilot should enforce saved constraints without changing the old player-booking flow.
6. **Availability checks need strengthening.** Existing checks inspect bookings; they do not reliably cover all unbooked tournament fixtures, cross-category clashes, both halves of a swap, stage windows and configured rest. The booking table has an overlap trigger and a unique same-start index, but these alone do not prove safety for simultaneous overlapping inserts with different start times.
7. **Authorization must be checked again on commit.** The current backend has `can_manage_tournament` and club `champs` permission helpers; scoring access also permits members/participants. A scoring permission, captain role, pilot switch or visible button is not rescheduling authority. No dedicated named-organizer assignment was established by this audit.
8. **Calendar refresh already exists.** Match updates patch the scoped query and Riverside polls every five seconds; marker presence is separately subscribed/polled. This can refresh List, Calendar, Progression and open details after a successful schedule change. Calendar must continue retaining scheduled FINAL matches.

## Priority gate: saved-score initialization
**Owner's exact Android failure: UNRESOLVED.** Existing Riverside initialization has a 20-second error/Retry deadline, catch cleanup and proposed-ID rejection. Previous checks exercised the Upcoming route and stalled-read recovery, not the owner's exact failing grid action/native Android path.

The timer covers the whole loading operation and should still show an error if a later lookup stalls; some later requests lack abort signals, so transport cleanup needs checking. A missing Riverside context, repeatedly restarted loading effect, route mismatch or stale initialization must be investigated rather than declared the cause. No fresh Riverside marker lock existed during this audit; three rows were saved as in progress, which is not proof of active marking.

Before rescheduling development:
- Obtain the failing Android URL or a screen recording from tournament selection through Mark Game; trace its real fixture ID and compare the Upcoming action.
- Reproduce desktop/mobile web and the relevant Android path signed in, without entering points or taking over a real marker.
- Verify bounded load, readable error, safe Retry, preserved saved/local scores, Back/reopen, context hydration and rejection of proposed fixture IDs.
- Stub stalled/failed reads and repeated effect mounts; check actual request, auth and error evidence. No real score writes to test recovery.
- Require owner confirmation that the formerly failing entry opens correctly. Uitsig receives regression checks, not changes.

## Intended interaction
- Keep selected tournament and the existing three primary tabs. Rescheduling lives in Fixtures Calendar, not Progression or a new navigation layer.
- Authorized users get a desktop drag handle. Dragging the handle must not conflict with the shared viewer's pan/zoom or normal card tap.
- Mobile and keyboard users get **Move match → select target → review → confirm**, with date/time/court inputs and equivalent validation. No drag gesture is required.
- Targets distinguish **Free court**, **Reserved for this tournament**, **Same-tournament match: swap candidate**, and **Unavailable / ownership unknown**. Text/icon reasons accompany colour.
- Dragging only previews; it never saves. The confirmation lists full names, category, duration, and old/new date/time/court for every affected match, plus booking consequences and planned notification channels.
- A changed target at confirmation produces a conflict and refreshed alternatives, not a silent override. Cancel leaves everything unchanged.

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
- Reuse `FixtureCalendar.tsx`, `ClubFixturesPilot.tsx`, `Tournaments.tsx`, `TournamentInteractiveViewer`, `fixture-scheduling.ts`, `self-schedule.ts`, `bookable-courts.ts` and saved round/stage definitions. Do not use `SwapFixtureButton.tsx` as the commit path.
- Authorities: `club_champs_matches` schedule/result/identity; `bookings` physical occupancy and links; `club_champs_rounds`, tournament stage/config rules for constraints; `champ_marker_locks` for active ownership. Live schema was inspected directly; older migration policies are not treated as current authority.
- Proposed commit input: tournament/match IDs, target slot or swap fixture, expected schedule/version snapshots and idempotency key. Derive the actor from validated auth; never trust submitted club/owner/role values. Gate Riverside and server-authorized tournament management on preview AND commit.
- One database transaction locks both matches, linked bookings and affected court/day allocation in deterministic order; re-reads status, permissions, reservations and conflicts; applies both schedules/bookings; inserts audit and notification-outbox records; rolls back entirely on failure. Preserve IDs, results, participants, standings and unrelated allocations. Include conflict protection against normal booking writers—not only the new operation—and verify marker-start interlocking.
- Do not simply call the single-match scheduler twice: intermediate overlaps, hold cancellation, notifications and triggers must be handled as one operation. Determine an exclusion/locking strategy compatible with existing booking writers before approving schema work; no global booking guard is weakened.
- Dispatch only after commit through the Communications engine and approved tournament messaging settings, with deduplication/retries and no duplicate legacy notifications. Result-notification settings are not automatically schedule-notification consent. Notification failure must not undo a committed schedule; show delivery state and retry safely.
- Review booking triggers for cancellation penalties, lights, access, reminders and external sync before enabling writes. Preserve existing idempotent integration workflows; never expose credentials or operate hardware in tests. If suppression/isolation cannot be guaranteed, synthetic commit testing is blocked.

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
