ALTER TABLE public.league_match_results
  DROP CONSTRAINT IF EXISTS league_match_results_position_check;
ALTER TABLE public.league_match_results
  ADD CONSTRAINT league_match_results_position_check CHECK (position BETWEEN 1 AND 8);

ALTER TABLE public.league_fixture_lineups
  DROP CONSTRAINT IF EXISTS league_fixture_lineups_position_check;
ALTER TABLE public.league_fixture_lineups
  ADD CONSTRAINT league_fixture_lineups_position_check CHECK (position BETWEEN 1 AND 8);