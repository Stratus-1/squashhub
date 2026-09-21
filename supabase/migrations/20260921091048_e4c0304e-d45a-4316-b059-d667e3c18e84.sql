ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS allow_solo_bookings boolean NOT NULL DEFAULT true;

GRANT SELECT (allow_solo_bookings) ON public.clubs TO anon;