ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS booking_open_time time NOT NULL DEFAULT '05:00:00',
  ADD COLUMN IF NOT EXISTS booking_last_slot_time time NOT NULL DEFAULT '22:00:00';