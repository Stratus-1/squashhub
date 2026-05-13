
CREATE OR REPLACE FUNCTION public.sync_match_results_from_lineup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id uuid;
  v_position int;
  v_member_id uuid;
  v_week_start date;
  v_op text := TG_OP;
  v_league_code text;
  v_assoc_id uuid;
  v_club_id uuid;
  v_member_name text;
  v_player_code text;
  v_fix record;
  v_is_home boolean;
  v_has_scores boolean;
BEGIN
  IF v_op = 'DELETE' THEN
    v_league_id := OLD.league_id;
    v_position  := OLD.position;
    v_week_start := OLD.week_start_date;
    v_member_id := NULL;
  ELSE
    v_league_id := NEW.league_id;
    v_position  := NEW.position;
    v_week_start := NEW.week_start_date;
    v_member_id := NEW.club_member_id;
  END IF;

  SELECT l.code, l.association_id, l.club_id
    INTO v_league_code, v_assoc_id, v_club_id
  FROM leagues l WHERE l.id = v_league_id;

  IF v_league_code IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve player display name + NSA / club number for the new member (if any)
  IF v_member_id IS NOT NULL THEN
    SELECT cm.name, cm.club_member_number INTO v_member_name, v_player_code
    FROM club_members cm WHERE cm.id = v_member_id;

    -- Prefer NSA league number for the league's association if available
    SELECT COALESCE(NULLIF(mlr.league_association_number, ''), v_player_code)
      INTO v_player_code
    FROM member_league_registrations mlr
    WHERE mlr.club_member_id = v_member_id
      AND mlr.league_id = v_league_id
    LIMIT 1;
  END IF;

  -- Iterate matching fixtures (home or away) for this league within the week
  FOR v_fix IN
    SELECT plf.id,
           (plf.home_team_code = v_league_code) AS is_home
    FROM platform_league_fixtures plf
    WHERE (plf.home_team_code = v_league_code OR plf.away_team_code = v_league_code)
      AND plf.fixture_date >= v_week_start
      AND plf.fixture_date <  v_week_start + INTERVAL '7 days'
  LOOP
    -- Skip if any score has been recorded for this fixture
    SELECT EXISTS (
      SELECT 1 FROM league_match_results lmr
      WHERE lmr.fixture_id = v_fix.id
        AND (COALESCE(lmr.home_games_won,0) > 0
          OR COALESCE(lmr.away_games_won,0) > 0
          OR COALESCE(lmr.is_forfeit,false) = true)
    ) INTO v_has_scores;
    IF v_has_scores THEN CONTINUE; END IF;

    IF v_fix.is_home THEN
      UPDATE league_match_results
         SET home_player_code = v_player_code,
             home_player_name = v_member_name,
             updated_at = now()
       WHERE fixture_id = v_fix.id AND position = v_position;
    ELSE
      UPDATE league_match_results
         SET away_player_code = v_player_code,
             away_player_name = v_member_name,
             updated_at = now()
       WHERE fixture_id = v_fix.id AND position = v_position;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_match_results_from_lineup ON public.league_week_lineups;
CREATE TRIGGER trg_sync_match_results_from_lineup
AFTER INSERT OR UPDATE OR DELETE ON public.league_week_lineups
FOR EACH ROW EXECUTE FUNCTION public.sync_match_results_from_lineup();
