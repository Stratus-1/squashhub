ALTER TABLE public.sportyhq_profiles
  ADD COLUMN IF NOT EXISTS wins_all_time integer,
  ADD COLUMN IF NOT EXISTS handedness text,
  ADD COLUMN IF NOT EXISTS birthday text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS nickname text;