ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS roster_seeded_at timestamptz;