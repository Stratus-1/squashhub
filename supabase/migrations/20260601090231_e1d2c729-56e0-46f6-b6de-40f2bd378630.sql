ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS max_bookings_per_day integer NOT NULL DEFAULT 4;