CREATE OR REPLACE FUNCTION public.save_bells_match_result(_match_id uuid, _side_a_points integer, _side_b_points integer)
 RETURNS club_champs_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.club_champs_matches;
  _winner uuid;
  _score text;
  _md boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    -- Match Day link (court tablet / QR): scoped to that one tournament while open
    IF public.md_hdr_champ() IS NOT NULL AND public.md_hdr_champ_open() THEN
      _md := true;
    ELSE
      RAISE EXCEPTION 'You must be signed in to save this result.' USING ERRCODE = '28000';
    END IF;
  END IF;

  IF COALESCE(_side_a_points, 0) < 0 OR COALESCE(_side_b_points, 0) < 0 THEN
    RAISE EXCEPTION 'Scores cannot be negative.' USING ERRCODE = '22023';
  END IF;

  SELECT m.* INTO _row
  FROM public.club_champs_matches m
  JOIN public.club_champs c ON c.id = m.champ_id
  WHERE m.id = _match_id
    AND c.scoring_mode = 'time_capped_points'
    AND (
      (NOT _md AND public.can_mark_bells_match(auth.uid(), m.id))
      OR (_md AND m.champ_id = public.md_hdr_champ()
          AND (COALESCE(lower(m.status),'') NOT IN ('completed','forfeited','walkover','cancelled')
               OR m.updated_at > now() - interval '2 minutes'))
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have permission to save this Bells result.' USING ERRCODE = '42501';
  END IF;

  _winner := CASE
    WHEN COALESCE(_side_a_points, 0) > COALESCE(_side_b_points, 0) THEN _row.player_a_member_id
    WHEN COALESCE(_side_b_points, 0) > COALESCE(_side_a_points, 0) THEN _row.player_b_member_id
    ELSE NULL
  END;
  _score := COALESCE(_side_a_points, 0)::text || '-' || COALESCE(_side_b_points, 0)::text;

  UPDATE public.club_champs_matches
  SET side_a_points = COALESCE(_side_a_points, 0),
      side_b_points = COALESCE(_side_b_points, 0),
      score = _score,
      winner_member_id = _winner,
      status = 'completed',
      bell_ends_at = NULL,
      bell_paused_seconds = NULL,
      updated_at = now()
  WHERE id = _match_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.save_bells_match_result(uuid, integer, integer) TO anon;