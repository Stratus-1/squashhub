CREATE OR REPLACE FUNCTION public.move_player_to_lineup(
  p_club_id uuid,
  p_week_start_date date,
  p_target_league_id uuid,
  p_target_position int,
  p_club_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorize: caller must be captain of the TARGET league, or a club admin.
  IF NOT (
    public.is_league_captain(auth.uid(), p_target_league_id)
    OR public.is_club_admin(auth.uid(), p_club_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit lineup for this league';
  END IF;

  -- Remove the player from ANY other lineup row this week (move semantics).
  -- Runs as definer so it bypasses per-league RLS on the source row.
  DELETE FROM public.league_week_lineups
  WHERE club_id = p_club_id
    AND week_start_date = p_week_start_date
    AND club_member_id = p_club_member_id;

  -- Upsert into the target slot (unique on league + week + position)
  INSERT INTO public.league_week_lineups
    (club_id, league_id, week_start_date, position, club_member_id)
  VALUES
    (p_club_id, p_target_league_id, p_week_start_date, p_target_position, p_club_member_id)
  ON CONFLICT (league_id, week_start_date, position)
  DO UPDATE SET club_member_id = EXCLUDED.club_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_player_to_lineup(uuid, date, uuid, int, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.move_player_to_lineup(uuid, date, uuid, int, uuid) TO authenticated;