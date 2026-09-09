# Fix broken Events pages (admin list, event editor, event detail)

## What's wrong

The events screens were written against an older data layout that no longer exists in this project:

- `src/pages/EventDetail.tsx`, `src/pages/AdminEventEditor.tsx` and the events sections of `src/pages/Admin.tsx` read from tables called `events` and `event_rsvps` with a single `starts_at` timestamp.
- The live database has no such tables. Club events live in `club_events` (with `day_of_week`, `start_time`, `end_time`, `start_date`), their occurrences in `club_event_instances`, and replies in `club_event_rsvps` / `club_event_instance_rsvps`.

So anyone opening an event link (for example the "View event" link in a notification or WhatsApp invite) or the platform admin events list gets an error or an empty list. The monitoring note blamed a missing `starts_at` column on `club_events`; the real cause is that these three pages point at tables that were never created here.

## What to build

1. **Event detail page (`/events/:id`)**
   - Load the event from `club_events`, and when the link carries an occurrence, from `club_event_instances`.
   - Build the display date/time from `start_date` + `start_time`/`end_time` (recurring events show the next upcoming occurrence).
   - Read and write the member's reply through `club_event_rsvps` / `club_event_instance_rsvps` keyed on the member record, not the login id, so replies match what the events list and WhatsApp replies already record.
   - Scope every query to the member's club so nothing leaks across clubs.

2. **Admin events list and season events (`src/pages/Admin.tsx`)**
   - Query `club_events` scoped to the club, ordered by `start_date`/`start_time`.
   - Drop the obsolete `starts_at` range fallback and the `event_rsvps` audience query; use the club event RSVP tables for the broadcast audience.

3. **Admin event editor (`src/pages/AdminEventEditor.tsx`)**
   - Save and load using the club event fields (date, start time, end time, recurrence) instead of a single timestamp.
   - Where the club-admin event creator (`src/components/CreateClubEvent.tsx`) already implements this correctly, reuse its logic rather than writing a second version.

4. **Verify** with a signed-in run through: open an event link from a notification, change a reply, view the admin list, edit an event.

## Technical notes

- Source of truth stays `club_events` / `club_event_instances` / `club_event_rsvps`; no new tables, no schema change, no new RSVP path.
- Keep the existing RSVP sync trigger between event-level and instance-level replies intact.
- The `fromExt()` casts in these files exist only to bypass types for tables that don't exist; they should be replaced with typed queries so this class of breakage surfaces at build time.
- No deployment as part of this change.
