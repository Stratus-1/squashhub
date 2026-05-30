-- Protect captain-submitted scorecards & lineups from accidental wipes
-- when a fixture is deleted (e.g. via "edit fixture" delete+insert flows).
-- Switch ON DELETE CASCADE -> ON DELETE RESTRICT so Postgres refuses
-- to delete a fixture that has any saved result, match score, or lineup.

ALTER TABLE public.league_fixture_results
  DROP CONSTRAINT IF EXISTS league_fixture_results_fixture_id_fkey,
  ADD  CONSTRAINT league_fixture_results_fixture_id_fkey
    FOREIGN KEY (fixture_id)
    REFERENCES public.platform_league_fixtures(id)
    ON DELETE RESTRICT;

ALTER TABLE public.league_match_results
  DROP CONSTRAINT IF EXISTS league_match_results_fixture_id_fkey,
  ADD  CONSTRAINT league_match_results_fixture_id_fkey
    FOREIGN KEY (fixture_id)
    REFERENCES public.platform_league_fixtures(id)
    ON DELETE RESTRICT;

ALTER TABLE public.league_fixture_lineups
  DROP CONSTRAINT IF EXISTS league_fixture_lineups_fixture_id_fkey,
  ADD  CONSTRAINT league_fixture_lineups_fixture_id_fkey
    FOREIGN KEY (fixture_id)
    REFERENCES public.platform_league_fixtures(id)
    ON DELETE RESTRICT;