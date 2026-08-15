ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS league_scoring_modes jsonb,
  ADD COLUMN IF NOT EXISTS league_points_per_game jsonb,
  ADD COLUMN IF NOT EXISTS league_best_of jsonb;