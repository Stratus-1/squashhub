CREATE OR REPLACE FUNCTION public.sync_bells_match_state(
  _match_id uuid,
  _side_a_points integer,
  _side_b_points integer,
  _bell_ends_at timestamp with time zone DEFAULT NULL,
  _bell_paused_seconds integer DEFAULT NULL,
  _status text DEFAULT 'in_progress',
  _patch_timer boolean DEFAULT false
)
RETURNS public.club_champs_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.club_champs_matches;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to score this match.' USING ERRCODE = '28000';
  END IF;

  IF COALESCE(_side_a_points, 0) < 0 OR COALESCE(_side_b_points, 0) < 0 THEN
    RAISE EXCEPTION 'Scores cannot be negative.' USING ERRCODE = '22023';
  END IF;

  IF _status NOT IN ('scheduled', 'in_progress') THEN
    RAISE EXCEPTION 'Invalid live match status.' USING ERRCODE = '22023';
  END IF;

  SELECT m.* INTO _row
  FROM public.club_champs_matches m
  JOIN public.club_champs c ON c.id = m.champ_id
  WHERE m.id = _match_id
    AND c.scoring_mode = 'time_capped_points'
    AND public.is_club_member(auth.uid(), c.club_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have permission to score this Bells match.' USING ERRCODE = '42501';
  END IF;

  IF _row.status = 'completed' THEN
    RAISE EXCEPTION 'This match is already completed.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.club_champs_matches
  SET side_a_points = COALESCE(_side_a_points, 0),
      side_b_points = COALESCE(_side_b_points, 0),
      bell_ends_at = CASE WHEN _patch_timer THEN _bell_ends_at ELSE bell_ends_at END,
      bell_paused_seconds = CASE WHEN _patch_timer THEN _bell_paused_seconds ELSE bell_paused_seconds END,
      status = _status,
      updated_at = now()
  WHERE id = _match_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bells_match_state(uuid, integer, integer, timestamp with time zone, integer, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_bells_match_result(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_bells_match_state(uuid, integer, integer, timestamp with time zone, integer, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_bells_match_result(uuid, integer, integer) TO authenticated, service_role;