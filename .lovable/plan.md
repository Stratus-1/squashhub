# Uitsig GoBook reconnection for Club Championships — plan only

No changes to Uitsig live data, no reconnection, no migrations, no notices. Nothing in this plan runs until you approve each gate.

## What exists today (checked read-only)

- Uitsig has a GoBook service set up. There are 632 GoBook-mirrored bookings in SquashHub, 7 of them active and in the future. No structured tournament block bookings (`sbs:` IDs) exist for Uitsig.
- The day sync (`sync_core_day`) reads the GoBook booking list for one day, saves or updates each booking as a SquashHub copy, and **cancels any SquashHub copy for that day that GoBook no longer lists**. It only proceeds when GoBook returns a valid list (tests already cover this).
- The booker's name is matched to a member by name only. Nothing recognises reserved names such as "Club Championships". A block would be copied as an ordinary booking under that name.
- Tournament matches link to a booking only through an explicit `booking_id`. The new trigger copies a linked booking's date, time and court into the match, and falls back to Play by when that booking is cancelled.
- **Main risk:** today, if GoBook drops or renames a "Club Championships" block, the sync cancels the SquashHub copy. Any match linked to it would then lose its court and time. It could also free up a slot that players have already been given.
- **No verified backup exists.** I have not created or tested a point-in-time backup of Uitsig bookings, fixtures, results, allocations or GoBook IDs. Please treat backups as missing until Phase 1 proves otherwise.

## Target behaviour

- **Reserved names:** each club gets a list of recognised reserved booking names in its Court Booking Rules. The list starts empty. It is set to "Club Championships" for Uitsig only after you approve, and it is linked to a specific tournament and date range. A name match alone never counts as proof that a block belongs to the tournament. The admin confirms each mapping once, and only then does the block count as tournament capacity.
- **Who owns what:** GoBook decides which reserved blocks exist (date, court, time). SquashHub decides which match uses each slot and which players' names are shown.
- **New block in GoBook:** it becomes free tournament capacity and changes no existing match.
- **Block removed or shortened in GoBook:** the match keeps its allocation and is marked "Conflict: block no longer in GoBook". Nothing is moved or cleared automatically, and the admin resolves it.
- **Conflicts get flagged:** overlaps with a personal booking, a block shrinking under an allocated match, a player double-booked, or a missed rest gap.
- **Free booking inside blocks:** eligible players book from Upcoming Fixtures at no charge, inside verified blocks only. The booking links to their match through `booking_id`. All other open slots stay paid and sync normally.
- **Fixtures and log update:** any scheduling change updates Progression & Log and Upcoming Fixtures through the existing sync.

## Phased plan (each phase ends at a gate needing your approval)

**Phase 0 — Read-only inventory**
- Pull the GoBook booking list for each tournament date, read-only, and keep it in memory only.
- Compare it with SquashHub bookings and matches.
- Report blocks by name, unmatched names, linked matches, and items that conflict or are unclear.
- No writes.

**Phase 1 — Verified backups and restore test**
- Take a point-in-time export, kept only to restricted backend storage, of these items for Uitsig only:
  - bookings (GoBook IDs included)
  - tournament matches, results, rounds and stages
  - booking links and sync mappings
  - Court Booking Rules
  - tournament settings
- Record row counts and checksums for each file.
- Restore into an isolated copy, not live, and check that the counts and checksums match.
- No backup is called "verified" until the restore test passes.

**Phase 2 — Isolated staging build (no live effect)**
- Add the Court Booking Rules field for reserved names: empty for every club, not set for Uitsig.
- Add a block-mapping record (tournament, GoBook ID, date, court, time, verified by and when) and an audit log.
- Change the sync so a mapped block that disappears is marked missing and flagged, not cancelled, while any match allocated to it is kept.
- Unmapped bookings behave exactly as today.
- Add free booking within verified blocks.
- Tests use a fake GoBook only:
  - repeated syncs, which should change nothing
  - blocks added and removed
  - cancellations
  - a renamed block
  - an invalid GoBook reply
  - personal-booking overlap
  - multiple days
  - checks that other clubs are untouched

**Phase 3 — Super Admin-only preview**
- Run against a snapshot of Uitsig: live GoBook reads, no writes.
- Show the proposed block mappings, the effect on each match, and the admin conflict report.
- Simulate the next sync before and after.

**Phase 4 — Go / no-go**
- You review the conflict report, the mappings and the backup proof.
- You give explicit written approval before Uitsig's reserved name is turned on.

**Phase 5 — Careful activation**
- Turn on the reserved name for Uitsig, confirm the mappings, and run one supervised sync for a single day.
- Compare the result with the expected outcome, then widen to all tournament dates.
- Watch the audit log.

**Phase 6 — Targeted rollback (ready before Phase 5)**
- Undo only the changes the audit log records for this activation: mapping records, statuses changed by the sync, and links it added.
- Keep bookings, results and changes made by players or admins after activation.
- The full restore is a last resort only.

## Blockers and open questions

1. No verified backup or tested restore yet (Phase 1).
2. The exact text GoBook stores for the blocks is unknown ("Club Championships", or the name with a client number in front). Phase 0 will confirm this.
3. Should a removed GoBook block ever release a match automatically? The plan assumes **never**: the admin decides.
4. Free bookings inside a block: should they also create a GoBook booking, or stay in SquashHub only inside the reserved block? The plan assumes **SquashHub only**, so the block itself is never double-booked in GoBook.
5. The automatic GoBook sync schedule for Uitsig must be paused or checked during Phases 4–5. Its current state has not been confirmed.

## Technical details

- Sync changes stay inside `gobook-api` `sync_core_day`. A mapped block's external ID is excluded from the step that cancels missing bookings, and a `missing_in_provider_at` flag is set instead.
- New tables, protected per club with admin-only access: `club_reserved_booking_names` and `tournament_block_mappings`. Both are added later, by migration, only after approval.
- Free in-block booking reuses the existing tournament "Book court" path plus a server check that the slot sits inside a verified block.
