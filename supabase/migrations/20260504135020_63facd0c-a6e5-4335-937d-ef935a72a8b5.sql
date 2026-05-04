-- Add generic external booking provider columns to clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS external_booking_provider text,
  ADD COLUMN IF NOT EXISTS external_booking_url text,
  ADD COLUMN IF NOT EXISTS external_booking_label text;

-- Backfill from legacy uses_gobook / gobook_url
UPDATE public.clubs
SET external_booking_provider = 'gobook',
    external_booking_url = gobook_url,
    external_booking_label = 'GoBook'
WHERE uses_gobook = true
  AND gobook_url IS NOT NULL
  AND external_booking_provider IS NULL;