CREATE OR REPLACE FUNCTION public.admin_correct_rubber_participant(p_fixture_id uuid, p_position integer, p_side text, p_player_code text, p_player_name text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed boolean;
  v_row public.league_match_results%ROWTYPE;
  v_old_code text;
  v_old_name text;
BEGIN
  IF p_side NOT IN ('home','away') THEN
    RAISE EXCEPTION 'Invalid side';
  END IF;

  -- Club admins and holders of the club's Leagues permission (e.g. Club Captain)
  -- for a fixture played by their own club.
  SELECT public.is_platform_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.platform_league_fixtures plf
        JOIN public.leagues l
          ON (NULLIF(upper(l.nsa_team_code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code))
           OR NULLIF(upper(l.code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code)))
        WHERE plf.id = p_fixture_id
          AND (public.is_club_admin(auth.uid(), l.club_id)
               OR public.is_club_admin_or_permitted(auth.uid(), l.club_id, 'leagues'))
      )
  INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Only a club admin or league organiser may correct a played game participant';
  END IF;

  SELECT * INTO v_row
  FROM public.league_match_results
  WHERE fixture_id = p_fixture_id AND position = p_position;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No recorded game at this position';
  END IF;

  IF p_side = 'home' THEN
    v_old_code := v_row.home_player_code;
    v_old_name := v_row.home_player_name;
  ELSE
    v_old_code := v_row.away_player_code;
    v_old_name := v_row.away_player_name;
  END IF;

  PERFORM set_config('app.participant_correction', 'on', true);

  IF p_side = 'home' THEN
    UPDATE public.league_match_results
       SET home_player_code = upper(COALESCE(p_player_code, '')),
           home_player_name = p_player_name,
           home_player_member_id = NULL,
           updated_at = now()
     WHERE fixture_id = p_fixture_id AND position = p_position;
  ELSE
    UPDATE public.league_match_results
       SET away_player_code = upper(COALESCE(p_player_code, '')),
           away_player_name = p_player_name,
           away_player_member_id = NULL,
           updated_at = now()
     WHERE fixture_id = p_fixture_id AND position = p_position;
  END IF;

  PERFORM set_config('app.participant_correction', 'off', true);

  INSERT INTO public.league_participant_corrections (
    fixture_id, position, side,
    old_player_code, old_player_name,
    new_player_code, new_player_name,
    corrected_by, reason
  ) VALUES (
    p_fixture_id, p_position, p_side,
    v_old_code, v_old_name,
    upper(COALESCE(p_player_code, '')), p_player_name,
    auth.uid(), p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'position', p_position,
    'side', p_side,
    'old_player_code', v_old_code,
    'old_player_name', v_old_name,
    'new_player_code', upper(COALESCE(p_player_code, '')),
    'new_player_name', p_player_name
  );
END;
$function$;