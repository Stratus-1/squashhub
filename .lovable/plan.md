# Riverside tournament calendar: safe Move / Swap pilot

## Scope and feasibility
**Feasible as fixture allocation inside verified tournament capacity.** Preserve block reservations unchanged; individually named bookings are not transferable inventory.

Read-only audit and plan: no app code, records, switches, migrations or publishing. Marker recovery is the first gate; plan approval does not authorize real fixture changes or hardware.

## Audit findings
- **Block reservation ≠ individual booking.** A fixture allocated within a tournament block normally has no per-match booking ID; this is not a defect. Calendar schedules alone do not prove block ownership or free capacity. The earlier Riverside-wide count of unlinked fixtures is not evidence of broken bookings.
- **Single-match scheduler is only partly reusable.** `self_schedule_champ_match` atomically updates booking + fixture and checks court/booking conflicts, but permits participants, does not explicitly block LIVE or enforce deadlines, and emits direct notifications. Do not call it unchanged for this feature.
- **Existing swap lacks atomicity.** `SwapFixtureButton` uses sequential updates/best-effort rollback and conflict overrides. Fixture-only updates are appropriate INSIDE an unchanged verified block, but must be atomic and validated. They must never silently relocate an individual booking.
- **Block evidence exists, but legacy ownership needs verification.** `bookings` has court/club/date/start/end, source/type, external ID and identity fields, but no tournament ID or dedicated creator field. Plan reservations use `sbs:<planId>:<stageId>:...`; saved tournament lifecycle answers can contain the plan ID. Description alone is only a clue. Verify server-saved tournament association, creator/owner provenance, club/court, type, range and absence of player identity; ambiguous legacy blocks enter admin verification, not blanket rejection or auto-claim.
- **Windows differ.** Existing play-by booking allows after-deadline scheduling with a warning. Fixed centrally managed slots, linked player bookings and explicit deadlines must remain distinct; stricter new-pilot checks must not alter legacy player scheduling.
- **Concurrency is not established.** Bookings have an overlap trigger and unique same-start index, but these alone do not prove safety for concurrent overlapping inserts at different starts. Availability must include unbooked fixtures and all categories/tournaments, not only bookings.
- **Permission is not scoring access.** Use current tournament/champs management authority, not scoring access, captain role or switches. A separately appointed organizer model was not established.
- **Refresh is reusable.** Scoped match updates patch the query, Riverside polls every five seconds, and marker presence is separately subscribed/polled. Retain historical FINAL calendar events and refresh List/Calendar/Progression/open details.

## Priority gate: saved-score initialization
**Exact Android failure: UNRESOLVED.** Riverside has a 20-second error/Retry timer and proposed-ID guard, but prior verification did not reproduce the owner's exact grid/native path. The timer covers the whole operation; later requests lack abort signals, so cleanup needs checking. Route/context/effect races remain hypotheses, not proven causes.

Obtain the failing URL/recording and compare grid vs Upcoming signed-in desktop/mobile/Android without points or marker takeover. Trace IDs/auth/pending reads; verify bounded Retry, Back/reopen, context hydration, preserved scores and proposed-ID rejection, including stalls/repeated mounts. Require owner confirmation before rescheduling development. No fresh marker lock existed during this audit.

## Intended interaction
Keep tournament selection and the three existing tabs; moves belong in Fixtures Calendar. Authorized desktop users get a drag handle separate from pan/zoom/card tap. Mobile/keyboard alternative: **Move match → choose date/time/court target → review → confirm**.

Targets: **Tournament block · available capacity**, **Tournament fixture · swap candidate**, **Individually booked · member arrangement required**, **Unreserved free court · separate reservation required**, **Externally occupied**, **Block ownership · verification required**. Use text/icons as well as colour. Dragging never saves. Confirm both matches' full names/category/duration and old/new slots, stating **Block reservation remains unchanged**. Changed availability rejects; Cancel changes nothing. Legacy candidates offer an authorized verification review of ownership evidence before eligibility.

## Validation and protection rules
- Existing eligible UUID fixtures only, same selected Riverside tournament. Block unauthorized users, LIVE/COMPLETED/decided/cancelled matches, byes and past starts. Check saved scoring and fresh marker locks, never time alone; interlock commit with marker acquisition.
- Validate full duration from linked booking and saved pool/category/stage settings, active eligible courts, tournament dates/windows, round order and configured rest. Missing/ambiguous information blocks rather than invents. Use club-local time. Enforce explicit play-by deadlines without converting fixed fixtures to deadlines or changing legacy player scheduling.
- Check overlapping bookings/imported external occupancy AND unbooked fixtures across all categories and tournaments. Check singles/doubles participants and shared person identities without conflating family members sharing a login. Unavailable external checks mean availability unknown.
- **A — Block capacity:** move fixtures without linked individual bookings among any free court/time within the same verified tournament block/envelope. Entire duration must fit the covered court/date/time and applicable round/stage rules. Check other fixtures/all categories, player conflicts and external occupancy. Update fixture allocation only; preserve original booking IDs, rows, status, ranges and ownership completely. Old allocation becomes free capacity inside the SAME unchanged block.
- **A — Swap:** both fixtures must belong to the same verified envelope and have no individual booking dependency. Validate both full durations independently, excluding only their previous allocations. Commit both fixture schedules atomically, without cancelling, splitting, recreating or reassigning any block booking. Multiple court rows form one envelope only with verified grouping; no cross-envelope inference.
- **B — Individual booking:** structured member/player identity, a linked participant booking or verified player-named booking makes it non-interchangeable. No automatic move/cancel/reassignment, even by admin. Show who must arrange the change and direct to existing member booking workflow or a separately approved explicit workflow. An organizer creator is provenance, not automatically a participant; conflicting identity evidence requires verification.
- Legacy uncertainty disables moves only until authorized evidence review establishes ownership; review never strips player identity or silently converts personal bookings. Unreserved free slots and external bookings remain outside the first block-only pilot.
- Proposed positional TBD slots remain read-only, never marker IDs/bookings. First pilot also excludes persisted synthetic TBD fixtures because player-clash validation is incomplete. No fixture creation or positional engine conversion.

## Phased pilot and approval gates
**0 — Resolve marker loading first.** Complete the exact-path recovery checks and owner confirmation; rescheduling development remains blocked.

**1 — Read-only preview, after approval.** Riverside-only fail-closed switch; classify blocks vs personal bookings, display ownership evidence/verification preview, then validate desktop/mobile block Move/Swap. Local synthetic scenarios and read-only live inspection; no mapping writes, reservations or messages. Owner reviews.

**2 — Block-only atomic operation in isolated tests, separately approved.** Approve any mapping/schema/test records separately. Build authorized ownership verification, fixture-only Move/Swap, audit and outbox; prove block bookings remain byte-for-byte unchanged. Shared live synthetic tournaments are not sufficient isolation; prevent hardware/provider/messages during tests.

**3 — Explicit real-tournament sign-off.** Riverside block-only moves, then swaps within the same verified capacity. Individual bookings remain protected. Free-slot reservations, cross-block transfers and personal-booking changes require separate approval. Reverse through freshly validated allocation; no bulk/scoring/automatic changes.

**4 — Broader rollout is not authorized.** Uitsig/other clubs remain unchanged. Publishing requires an explicit request.

## Technical design and evidence
- Reuse `FixtureCalendar`, `ClubFixturesPilot`, `Tournaments`, the shared viewer, `fixture-scheduling.ts`, `self-schedule.ts`, `bookable-courts.ts` and saved round/stage rules. Do not use `SwapFixtureButton` for commit.
- Live schema was inspected: `club_champs_matches` owns schedule/result/identity; `bookings` owns physical occupancy; rounds/stages own constraints; `champ_marker_locks` owns marker presence. 
- Preview/commit accept tournament/fixture IDs, target or swap, expected version/schedule snapshots and an idempotency key. Derive actor from validated auth; server-check management permission and Riverside scope on both calls.
- **Minimal mapping:** use existing `sbs:` IDs only when server-saved plan→tournament association and provenance can be verified. No local-storage ownership claims. For legacy blocks lacking reliable linkage, recommend a small additive mapping from booking ID to club/tournament/envelope, with verifier/time/evidence and revision; optionally record provenance for future blocks. A block spans court booking rows through that verified envelope. Do not add per-fixture bookings. Reuse `audit_events` for before/after verification/allocation evidence where appropriate. Exact mapping requires later schema approval; none is created now.
- Block commit locks matches, ownership mapping, block rows and affected allocations deterministically; rechecks auth, marker status, duration/windows and occupancy, then updates ONLY fixture schedules plus audit/outbox. Both swap halves roll back together. Preserve every block/personal booking and result field. Coordinate with allocation writers, block edits and marker acquisition; mapping is authority only when still consistent with the current booking.
- Audit actor, selected tournament/envelope, verification evidence, both before/after allocations and request ID, explicitly recording unchanged block IDs/ranges. Separate verification authority from scoring permissions; management permission must be server-checked. Never call scheduler/unscheduler, cancel holds or weaken global overlap guards for block allocation.
- Dispatch after commit through Communications engine and approved tournament messaging settings, deduplicated/retryable. Result-notification settings are not schedule consent. Delivery failure does not undo a committed move; prevent duplicate legacy notifications.
- Review booking triggers for cancellation penalties, lights, access, reminders and external sync. Isolated tests must block hardware/provider/message actions; if isolation is unavailable, write testing stays blocked.

## Tests and acceptance
**Audit checks: 45 existing tests passed** (marker deadline, calendar scores, scheduling/display/split, club fixtures). Non-failing warnings: dialog description and JSDOM scrolling. No commit flow tested.

Future tests: no per-match booking within valid blocks; unchanged block rows after Move/Swap; multiple courts under one verified envelope; personal bookings rejected; false championship labels and legacy verification; expired/changed mappings; all categories/external occupancy; unequal durations/overlaps/deadlines/rest; live/final/marker/concurrent edits; wrong-club/unauthorized callers; idempotent retry/full rollback; one post-commit notification; no hardware; List/Calendar/Progression parity; mobile/keyboard/zoom; Uitsig unchanged.

Acceptance: fixture allocations read back within verified capacity; original block and individual bookings remain unchanged; no overlaps/lost holds; results unchanged; before/after audit identifies actor/envelope; views agree; owner signs off.

## Decisions and blockers
- Exact Android URL/recording and verified recovery.
- Proven reservation ownership, durations/windows and external availability.
- Isolated commit tests without hardware/providers/messages.
- Confirm organizer authority: existing tournament/champs permission or separately appointed organizer; no new role assumed.
- Start with verified block-only allocations; legacy verification/mapping must be approved separately from actual rescheduling. Personal bookings and unreserved-slot changes are separate workflows.
