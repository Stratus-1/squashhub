ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS group_break_minutes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_break_minutes numeric NOT NULL DEFAULT 0;