CREATE OR REPLACE FUNCTION public.move_player_to_lineup(
  p_club_id uuid,
  p_week_start_date date,
  p_target_league_id uuid,
  p_target_position integer,
  p_club_member_id uuid,
  p_allow_multi boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_league_captain(auth.uid(), p_target_league_id)
    OR public.is_club_admin(auth.uid(), p_club_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit lineup for this league';
  END IF;

  IF p_allow_multi THEN
    -- Keep other teams' lineups intact; only clear any duplicate slot for this
    -- player within the TARGET league.
    DELETE FROM public.league_week_lineups
    WHERE club_id = p_club_id
      AND week_start_date = p_week_start_date
      AND league_id = p_target_league_id
      AND club_member_id = p_club_member_id;
  ELSE
    DELETE FROM public.league_week_lineups
    WHERE club_id = p_club_id
      AND week_start_date = p_week_start_date
      AND club_member_id = p_club_member_id;
  END IF;

  INSERT INTO public.league_week_lineups
    (club_id, league_id, week_start_date, position, club_member_id)
  VALUES
    (p_club_id, p_target_league_id, p_week_start_date, p_target_position, p_club_member_id)
  ON CONFLICT (league_id, week_start_date, position)
  DO UPDATE SET club_member_id = EXCLUDED.club_member_id;
END;
$function$;