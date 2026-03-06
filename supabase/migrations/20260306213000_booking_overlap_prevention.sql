-- Prevent overlapping bookings per court/day, enabling 30-minute slots safely.
-- Replaces the old unique index on (court_id, date, start_time) with an exclusion constraint.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Old rule: only one booking per start_time.
-- New rule: no overlapping time ranges for the same court on the same day.
DROP INDEX IF EXISTS public.idx_no_double_booking;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_time_boundaries
  CHECK (
    end_time > start_time
    AND EXTRACT(minute FROM start_time) IN (0, 30)
    AND EXTRACT(minute FROM end_time) IN (0, 30)
  );

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlaps
  EXCLUDE USING gist (
    court_id WITH =,
    tsrange((date::timestamp + start_time), (date::timestamp + end_time), '[)') WITH &&
  )
  WHERE (status = 'active');

