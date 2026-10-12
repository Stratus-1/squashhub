-- Per-tournament ladder switch may only narrow the club-wide permission, never bypass it.
-- No timing change: still per confirmed singles match, via apply_ladder_result (auto-apply or pending queue).
CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_loser uuid;
  v_override boolean;
  v_enabled boolean;
  v_move text;
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

  SELECT t.club_id, t.ladder_affects INTO v_club_id, v_override
  FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(
    v_club_id, NEW.winner_member_id, v_loser, 'tournament', NEW.id
  );

  SELECT COALESCE(lc.ladder_from_tournaments,true),
         COALESCE(lc.tournament_movement_policy, lc.movement_policy, 'insert')
    INTO v_enabled, v_move
  FROM public.ladder_configs lc WHERE lc.club_id = v_club_id;
  v_enabled := COALESCE(v_enabled, true);

  -- Club permission first; the tournament switch can only turn it off (NULL = inherit).
  IF v_enabled AND COALESCE(v_override, v_enabled) IS TRUE THEN
    PERFORM public.apply_ladder_result(
      v_club_id, NEW.winner_member_id, v_loser, COALESCE(v_move,'insert'), 'tournament', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;