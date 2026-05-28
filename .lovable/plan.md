# Stage 2 — GoBook two-way sync (driven by club settings)

Reuses existing club config:
- `clubs.uses_gobook` — gates all GoBook behavior (no hardcoded club).
- `clubs.gobook_url` — base URL for that club's GoBook tenant.
- `clubs.booking_slot_minutes` — drives slot length (CSIR = 60, hourly only).

If `uses_gobook=false` nothing in this stage runs. If `booking_slot_minutes <> 60` we skip GoBook calls (GoBook is hourly-only) and surface a one-line config warning to admins.

## A. Migration

`public.bookings`:
- `source TEXT NOT NULL DEFAULT 'squashhub'` (`squashhub` | `gobook`)
- `external_id TEXT` — `YYYYMMDD-{slotId}` from GoBook
- `external_booker_name TEXT`
- `user_id` → make nullable + CHECK `(user_id IS NOT NULL OR source <> 'squashhub')`
- Partial unique index on `(club_id, source, external_id) WHERE external_id IS NOT NULL`

`public.member_gobook_credentials`:
- `is_sync_source BOOLEAN NOT NULL DEFAULT true` — cron picks any verified, opted-in cred for the club.

## B. Edge function `gobook-sync`

Self-contained (duplicates the small login/decrypt helpers from `gobook-book`).

Inputs:
- `{ club_id, days?=14 }` (manual) or `{ cron: true }` + `X-Cron-Secret` header (cron mode iterates every `uses_gobook=true` club).

Per club:
1. Load club row. Bail if `uses_gobook=false` or `booking_slot_minutes <> 60`.
2. Pick a verified `is_sync_source=true` credential (most recently verified). Bail with `no_sync_source` if none.
3. Resolve courts: `select id, name from courts where club_id=$1 order by id` — map by court number parsed from `name` ("Court 1" → court #1). No hardcoded IDs.
4. For each date in `[today, today+days)`:
   - Fetch GoBook grid, parse hourly slots → `{courtNum, hour, bookerName, slotId}`.
   - Upsert into `bookings` with `source='gobook'`, `external_id`, `start_time=HH:00`, `end_time=(HH+1):00`, `external_booker_name`.
   - Best-effort link: if `external_booker_name` matches exactly one `club_members.full_name` in that club, set `club_member_id` (+ `user_id` if member is linked).
   - Delete `source='gobook'` rows for that date whose `external_id` is NOT in the fresh set (cancellations).
5. Return `{ synced, cancelled, dates, skipped_reason? }`.

## C. Push SquashHub → GoBook

Only fires when ALL true: `clubs.uses_gobook`, `clubs.booking_slot_minutes=60`, booker has verified `member_gobook_credentials`, new booking `source='squashhub'`, duration = 60 min.

Wire into the existing booking-create flow as fire-and-forget call to `gobook-book` `book` action. Toast shows `Pushed to GoBook ✓` or `GoBook push failed — retry` (manual retry button stays on the booking).

## D. UI

- **Bookings page header (any `uses_gobook` club)**: "Sync GoBook" button → calls `gobook-sync`, toast `Synced N · Cancelled M`. If `booking_slot_minutes <> 60`, button is disabled with tooltip "GoBook requires hourly slots".
- Existing booking cells show a small `GB` badge when `source='gobook'`.
- No new confirmation modal — push is automatic, toast is the feedback.

## E. Schedule (separate `insert` SQL per scheduled-jobs convention)

`pg_cron` every 15 min → `net.http_post` to `/functions/v1/gobook-sync` with `{ cron: true }` and `X-Cron-Secret` header. Cron iterates all `uses_gobook=true` clubs.

## Files

- 1 migration (schema only)
- `supabase/functions/gobook-sync/index.ts` (new)
- Bookings page component — add "Sync GoBook" button + `GB` badge (gated on `uses_gobook` + `booking_slot_minutes=60`)
- Booking-create handler — fire-and-forget `gobook-book` call under same gates
- 1 `insert` call to schedule pg_cron + a `CRON_SECRET` add_secret

## Order

1. Migration
2. `gobook-sync` function + manual test on CSIR
3. UI button + GB badge
4. Auto-push on create
5. Schedule cron

Confirm and I'll start with the migration.
