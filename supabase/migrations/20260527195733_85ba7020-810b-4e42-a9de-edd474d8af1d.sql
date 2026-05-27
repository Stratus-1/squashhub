
CREATE OR REPLACE FUNCTION public.freeze_completed_rubber()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Padlock: if the rubber already has a winner, silently preserve its
  -- final scoring fields against any later "live" writes that race in.
  -- Admins can still correct a completed rubber by first setting winner = NULL.
  IF OLD.winner IS NOT NULL AND NEW.winner IS NOT NULL THEN
    NEW.game_scores    := OLD.game_scores;
    NEW.home_games_won := OLD.home_games_won;
    NEW.away_games_won := OLD.away_games_won;
    NEW.winner         := OLD.winner;
    NEW.current_game   := OLD.current_game;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_completed_rubber ON public.league_match_results;
CREATE TRIGGER trg_freeze_completed_rubber
  BEFORE UPDATE ON public.league_match_results
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_completed_rubber();
