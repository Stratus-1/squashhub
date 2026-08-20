ALTER TABLE public.league_match_results
  ADD COLUMN IF NOT EXISTS lineup_set_by uuid,
  ADD COLUMN IF NOT EXISTS lineup_set_at timestamptz;

ALTER TABLE public.league_fixture_results
  ADD COLUMN IF NOT EXISTS lineup_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS lineup_confirmed_at timestamptz;