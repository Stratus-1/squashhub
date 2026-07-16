ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS playoff_break_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS playoff_date DATE;