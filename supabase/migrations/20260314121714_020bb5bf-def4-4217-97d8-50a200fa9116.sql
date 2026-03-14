
-- Create a function for insert that updates stats when match is inserted as confirmed
CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  winner uuid;
  loser uuid;
BEGIN
  -- Only process if inserted as confirmed with a winner
  IF NEW.confirmed IS NOT TRUE OR NEW.winner_id IS NULL THEN
    RETURN NEW;
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  UPDATE public.profiles
  SET
    matches_played = matches_played + 1,
    wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id IN (winner, loser);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_confirmed_match_effects_insert
  AFTER INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_confirmed_match_effects_on_insert();
