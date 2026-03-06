-- Extend profiles with richer "public profile" fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS home_club text,
  ADD COLUMN IF NOT EXISTS dominant_hand text,
  ADD COLUMN IF NOT EXISTS years_playing integer,
  ADD COLUMN IF NOT EXISTS playing_style text,
  ADD COLUMN IF NOT EXISTS favorite_shot text,
  ADD COLUMN IF NOT EXISTS availability text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_dominant_hand_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_dominant_hand_check
      CHECK (dominant_hand IS NULL OR dominant_hand IN ('right', 'left', 'ambidextrous'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_years_playing_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_years_playing_check
      CHECK (years_playing IS NULL OR (years_playing >= 0 AND years_playing <= 80));
  END IF;
END $$;

