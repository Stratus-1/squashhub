ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS visitors_can_book boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visitors_access_control boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visitor_booking_fee numeric NOT NULL DEFAULT 0;