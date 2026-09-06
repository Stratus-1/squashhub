CREATE OR REPLACE FUNCTION public.league_team_pairs_no_reuse()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.player_one_member_id = NEW.player_two_member_id THEN
    RAISE EXCEPTION 'A pair must be two different players';
  END IF;

  IF NEW.is_active AND EXISTS (
    SELECT 1 FROM public.league_team_pairs p
    WHERE p.id IS DISTINCT FROM NEW.id
      AND p.is_active
      AND p.league_id = NEW.league_id
      AND p.season_id IS NOT DISTINCT FROM NEW.season_id
      AND (p.player_one_member_id IN (NEW.player_one_member_id, NEW.player_two_member_id)
           OR p.player_two_member_id IN (NEW.player_one_member_id, NEW.player_two_member_id))
  ) THEN
    RAISE EXCEPTION 'A player can only be in one active pair per team and season. Remove the existing pair first.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_team_pairs_no_reuse ON public.league_team_pairs;
CREATE TRIGGER league_team_pairs_no_reuse
BEFORE INSERT OR UPDATE ON public.league_team_pairs
FOR EACH ROW EXECUTE FUNCTION public.league_team_pairs_no_reuse();