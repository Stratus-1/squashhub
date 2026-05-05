-- Add forfeit/penalty support to league results
ALTER TABLE public.league_match_results
  ADD COLUMN IF NOT EXISTS is_forfeit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forfeit_side text CHECK (forfeit_side IN ('home','away'));

ALTER TABLE public.league_fixture_results
  ADD COLUMN IF NOT EXISTS home_penalty_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_penalty_points numeric NOT NULL DEFAULT 0;