CREATE OR REPLACE FUNCTION public.freeze_league_rubber_participants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.winner IS NOT NULL AND NEW.participants_locked_at IS NULL THEN
      NEW.participants_locked_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- A lock left behind on a rubber that has no result and no scores (e.g. a
  -- forfeit or score that was later undone) must not freeze the lineup of an
  -- unplayed game. Release it instead of silently discarding the change.
  IF OLD.participants_locked_at IS NOT NULL
     AND OLD.winner IS NULL
     AND COALESCE(jsonb_array_length(to_jsonb(OLD.game_scores)), 0) = 0
     AND COALESCE(OLD.is_forfeit, false) = false THEN
    NEW.participants_locked_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.participants_locked_at IS NOT NULL
     AND COALESCE(current_setting('app.participant_correction', true), '') <> 'on' THEN
    NEW.home_player_member_id  := OLD.home_player_member_id;
    NEW.away_player_member_id  := OLD.away_player_member_id;
    NEW.home_player2_member_id := OLD.home_player2_member_id;
    NEW.away_player2_member_id := OLD.away_player2_member_id;
    NEW.home_player_code  := OLD.home_player_code;
    NEW.away_player_code  := OLD.away_player_code;
    NEW.home_player_name  := OLD.home_player_name;
    NEW.away_player_name  := OLD.away_player_name;
    NEW.home_player2_code := OLD.home_player2_code;
    NEW.away_player2_code := OLD.away_player2_code;
    NEW.home_player2_name := OLD.home_player2_name;
    NEW.away_player2_name := OLD.away_player2_name;
    NEW.rubber_type := OLD.rubber_type;
    NEW.participants_locked_at := OLD.participants_locked_at;
  ELSIF NEW.winner IS NOT NULL AND NEW.participants_locked_at IS NULL THEN
    NEW.participants_locked_at := now();
  END IF;

  RETURN NEW;
END;
$function$;