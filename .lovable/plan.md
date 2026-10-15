# Uitsig GoBook reconnection for Club Championships — revised plan (plan only)

No changes to Uitsig live data, no reconnection, no migrations, no GoBook writes and no publishing. Each phase ends at a gate that needs your approval.

## Feasibility verdict

- **Recognising and syncing "Club Championships" blocks from GoBook: feasible.** This builds on the day sync that exists today.
- **Admin creating new blocks in SquashHub that are sent to GoBook: probably feasible, but not proven.** GoBook does not appear to have a separate "block" or "reservation" type. The likely method is booking under a dedicated GoBook client account called "Club Championships". This needs a read-only check and one approved test booking on a test club before Uitsig. If it fails, use the manual fallback (Phase 4B).

## What I found (read-only)

- **Current data:** Uitsig has a GoBook service set up, 632 bookings copied from GoBook (7 active and in the future), and no tournament block bookings created from SquashHub.
- **Day sync:** reads the GoBook booking list for one day and saves or updates each booking. It **cancels any SquashHub copy that GoBook no longer lists**, and does nothing if GoBook's reply is invalid (tests cover this).
- **Today's main risk:** if a block disappears or is renamed in GoBook, the copy gets cancelled. Any match linked to it would lose its court and time.
- **Block names come from the GoBook client name, not a title field.** In the GoBook list, the booking name is the client's display name (for example `1004; M 2nd LEAGUE`). So existing named blocks such as league nights seem to be bookings made under a dedicated GoBook client account. I have not checked this for Uitsig's Club Championships blocks.
- **What GoBook writes are confirmed in our code:**
  - **New booking:** `Booking/Book` takes the booking slot IDs (one or more), a client, the date and optional Notes. The court is fixed by those slots.
  - **Response:** the reply sometimes leaves out the new booking reference. Our code then reads the client's booking list again and picks up the one new matching booking. It never books twice after GoBook has accepted.
  - **Cancel:** this exists through the older website route (`gobook-book`, `Bookings/Maintain`) and through `gobook-api`'s `cancel` action.
  - **Free-slot check:** the slot lookup returns only free slots, which acts as GoBook's own double-booking check.
- **Unknown GoBook capabilities (unverified):**
  - a reservation or block type
  - a title field separate from the client name
  - whether Notes appear in the booking list
  - resizing a booking in place (probably cancel and rebook instead)
  - one booking spanning several courts (probably one booking per court)
  - whether the credentials our integration uses may book for any client
  - payment or charging rules for a "Club Championships" client
- **No verified backup exists.** Treat backups as missing until Phase 1 proves otherwise.

## Revised design

**Ownership is per tournament, not per club.**
- Tournament builder, Courts & Dates / Stages & Scheduling, gets an "External booking block" section:
  - block name (for example "Club Championships")
  - optional GoBook client (the dedicated block account)
  - the courts and date ranges it covers
- It is empty by default and is set for Uitsig Club Champs 2026 only after you approve.
- Club integration settings keep only the GoBook connection and general sync rules.
- A GoBook booking counts as tournament capacity only when all of these match:
  1. the name or client matches
  2. the court is one of the tournament's courts
  3. the date is inside the tournament's date range
  4. the admin has confirmed the mapping, either once per block or by a rule that is then audited
- Name alone is never proof. Unclear matches stay as ordinary bookings and are listed for review.

**Who owns what**
- GoBook owns which blocks exist and their date, court and times.
- SquashHub owns which match uses each slot and which players' names show in the SquashHub calendar.

**Sync behaviour**
- **New confirmed block:** becomes capacity and changes no match.
- **Block missing or shortened in GoBook:** marked "missing in GoBook", never cancelled automatically. Any allocated match keeps its slot and is flagged for the admin.
- **Conflicts flagged:** personal-booking overlap, a block shrinking under a match, a player double-booked, a missed rest gap.

**Players**
- Eligible players book their match inside a confirmed block from Upcoming Fixtures, free of charge.
- These bookings exist in SquashHub only and are linked to the match. No separate GoBook booking is made inside the block.
- Ordinary open slots stay paid and sync as normal.
- Progression & Log and Upcoming update through the existing link.

**Admin creates extra blocks (if Phase 4A passes)**
- An admin picks the courts, date and time window, then sees a preview of the GoBook slots and any clashes.
- On confirmation, SquashHub makes one GoBook booking per court, booked under the dedicated "Club Championships" client.
- Each booking gets its own SquashHub reference (tournament, court, date and start time), so retries never duplicate.
- Partial success is reported per court. Bookings that succeeded are kept; failed courts are listed with GoBook's message for retry.
- When GoBook accepts but sends no reference, SquashHub reads back the block client's booking list, as `book` already does.
- Resize means cancel and rebook, and needs confirmation when a match is allocated to that block.
- Cancelling is admin-only, refused while matches are allocated unless the admin reallocates them first, and audited.
- Only tournament admins of that club may do this; GoBook credentials are never sent to the browser.
- The next sync then recognises the block by its saved reference.

## Phases

- **Phase 0 — Read-only inventory.** Read the GoBook booking lists for each tournament date in memory only. Identify which client account the existing Club Championships blocks use, and compare them with SquashHub bookings and matches. No writes.
- **Phase 1 — Verified backups and restore test.** Take a point-in-time export of the following, for Uitsig only, with row counts and checksums:
  - bookings and their GoBook IDs
  - matches, results, rounds and stages
  - booking links and sync mappings
  - tournament and integration settings

  Restore into an isolated copy and compare. Nothing is called "verified" before the restore check passes.
- **Phase 2 — Staging build (no live effect).** Build the block settings in the tournament builder, the block mapping and audit records, and the sync change (a missing confirmed block is flagged, not cancelled). Tests run against a fake GoBook and cover repeated syncs, blocks added or removed or renamed, cancellations, invalid replies, overlaps, several days, and other clubs untouched.
- **Phase 3 — Super Admin-only preview.** Run against a Uitsig snapshot with live GoBook reads only. It shows the proposed mappings, the effect on each match, the conflict report, and a simulated next sync.
- **Phase 4A — GoBook block-write test (needs separate approval).** Use a test club or test GoBook service, not Uitsig. Check that our credentials may book for a dedicated block client, how the name appears, whether Notes come back, cancelling, multi-court bookings and charges.
- **Phase 4B — Fallback if 4A fails or is not approved.** Admins create blocks in GoBook themselves under "Club Championships". SquashHub shows a checklist of the block windows to create, then the next sync picks them up and asks the admin to confirm them.
- **Phase 5 — Go / no-go.** You review the backup proof, conflict report, mappings and 4A results, then give explicit approval.
- **Phase 6 — Careful activation.** Switch on the Uitsig tournament block setting, run one supervised sync for a single day, compare, then widen to all tournament dates. Admin block creation is enabled only if 4A passed.
- **Phase 7 — Targeted rollback (ready before Phase 6).** Undo only the changes in the activation audit: mappings, sync status changes, links created, and blocks created by SquashHub (cancelled in GoBook by their saved references). Keep later legitimate player and admin changes. A full restore is the last resort.

## Blockers

1. No verified backup or tested restore yet.
2. Which GoBook client account the current Club Championships blocks use is unknown (Phase 0).
3. Unproven: whether our GoBook credentials may book for a non-member block client, and whether that creates charges (Phase 4A).
4. No GoBook test service has been identified; Uitsig must not be used for write tests.
5. The automatic GoBook sync schedule for Uitsig must be checked, and paused if needed, during activation.
6. Decision needed: a block missing in GoBook never releases a match automatically (the plan assumes this).

## Technical notes

- New tables, added later only after approval and protected to club admins:
  - tournament block settings, stored on the tournament stage plan
  - block mappings (tournament, GoBook ID, court, date, times, confirmed by and when, missing-in-GoBook time)
  - audit log
- A new admin-only `create_block` action in `gobook-api` reuses `Booking/Book` with the block client's ID, the existing booking-reference recovery and a per-court idempotency key.
- `sync_core_day` leaves confirmed mapped IDs out of the step that cancels missing bookings.
