ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS booking_slot_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS peak_weekday_start time NOT NULL DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS peak_weekday_end time NOT NULL DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS peak_weekend_start time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS peak_weekend_end time NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS max_peak_bookings_per_day integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT clubs_booking_slot_minutes_check CHECK (booking_slot_minutes IN (30, 60));