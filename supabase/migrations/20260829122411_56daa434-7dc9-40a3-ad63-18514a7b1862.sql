CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_loser uuid;
BEGIN
  IF NEW.winner_member_id IS NULL OR COALESCE(NEW.is_bye,false) IS TRUE THEN RETURN NEW; END IF;
  IF NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.winner_member_id IS NOT DISTINCT FROM NEW.winner_member_id
     AND lower(COALESCE(OLD.status,'')) IN ('completed','confirmed','finished') THEN
    RETURN NEW;
  END IF;

  IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;

  v_loser := CASE WHEN NEW.winner_member_id = NEW.player_a_member_id
                  THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;

  SELECT t.club_id INTO v_club_id FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(
    v_club_id, NEW.winner_member_id, v_loser, 'tournament', NEW.id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.award_points_for_champ_match() FROM public, anon, authenticated;