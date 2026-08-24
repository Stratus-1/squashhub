ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS manual_draws jsonb,
  ADD COLUMN IF NOT EXISTS seed_order jsonb,
  ADD COLUMN IF NOT EXISTS manual_seed_divisions jsonb;