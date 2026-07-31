# Simplify club event creation

## Roles and booking rules

**Member (no special permission)**
- Can create events.
- Court bookings limited to **1 peak-hour slot + 1 non-peak slot** per event instance.
- Recurrence allowed (weekly/monthly/yearly) — the per-instance limit applies to each occurrence.
- If they exceed the limit, show a clear inline message before saving:
  "Members can book 1 peak-hour and 1 off-peak court per event. Ask a club admin to create this event or to grant you unlimited booking permission."

**Club admin (or member with `bookings_unlimited` / `events` permission)**
- Any time, any number of courts, any number of occurrences.
- Bookings are free — the club carries any light fees.
- No "Book under club name" toggle needed; admin events are automatically club-funded.

## Proposed changes

### 1. Automatic booking identity — remove the toggle
- Drop the "Book under Club name (free)" switch entirely.
- Admin-created events: booked under the club, free, exempt from limits and light fees.
- Member-created events: booked under the creating member, subject to the 1 peak + 1 off-peak rule and normal light-fee handling.
- All event bookings tagged `source: 'club_event'`.

### 2. Peak-hour guard with clear messaging
- Determine peak/off-peak per club settings for the chosen start time.
- For non-privileged creators, validate the selected courts against the 1 peak + 1 off-peak allowance and block Save with an explanatory inline note (not a silent failure).
- Privileged creators bypass the check completely — no warning noise.

### 3. Simpler single-step form
- Collapse the wizard into one card: Title, Description, Type, Date, Start/End time, Recurrence, Courts.
- Keep type/title/description exactly as they are today (no change requested).
- Move invite scope, reminder hours, and lights auto-on into an "Advanced" section; default invite scope stays "all members".
- Recurrence as a simple inline row: repeat weekly/monthly/yearly × N.

### 4. Clash and failure reporting (harden existing)
- Never fail the whole series on one clash — book every other instance.
- Persistent toast listing each failed slot (Court · Date · Time) with reason (already booked / peak limit / no permission) and a short "what to do" list.

### 5. Fix the edit path
- On edit, rebook **every** instance date, not just the first.
- Cancel bookings that no longer match the updated date/time/court set.
- Tag all rebooked slots with `source: 'club_event'`.
- Backfill missing court bookings for currently active events (e.g. School squash).

### 6. Event list clarity
- Replace the lingering "Loading…" placeholder with either "X courts booked" or a subtle "No courts booked" warning so admins spot problems immediately.

## Out of scope
- No schema changes beyond reading existing club peak-hour settings.
- No change to `AdminEventEditor.tsx` (season/social events).
- No change to event types, titles or descriptions — left exactly as they are.
- No tournament scheduler changes.

## Files to change
- `src/components/CreateClubEvent.tsx` — main logic: role-aware limits, single-step form, rebooking on edit, clash reporting.
- `src/pages/Events.tsx` — list badge / warning tweak.
- Optionally a small helper `src/lib/event-booking.ts` for instance-date + rebooking logic.

## Verification
- Member creates a weekly event with 2 peak courts → blocked with the explanatory message.
- Member creates 1 peak + 1 off-peak → saves, books all occurrences.
- Admin creates 4 courts × 8 weeks at peak time → all book, free, no warnings.
- Edit an event's time → old bookings cancelled, all new instance dates booked.
- Force one clash → other instances still save, toast lists the failed slot.