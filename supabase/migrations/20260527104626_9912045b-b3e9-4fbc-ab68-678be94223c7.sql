CREATE OR REPLACE FUNCTION public.move_player_to_league_pool(
  p_club_id uuid,
  p_week_start_date date,
  p_source_league_id uuid,
  p_target_league_id uuid,
  p_club_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source_league public.leagues%ROWTYPE;
  v_target_league public.leagues%ROWTYPE;
  v_platform_association_id uuid;
  v_same_gender_group boolean;
  v_cross_gender_allowed boolean;
  v_is_natural_cascade boolean := false;
  v_cascaded_from uuid;
BEGIN
  SELECT * INTO v_source_league
  FROM public.leagues
  WHERE id = p_source_league_id AND club_id = p_club_id;

  SELECT * INTO v_target_league
  FROM public.leagues
  WHERE id = p_target_league_id AND club_id = p_club_id;

  IF v_source_league.id IS NULL OR v_target_league.id IS NULL THEN
    RAISE EXCEPTION 'Source and target leagues must belong to this club';
  END IF;

  IF NOT (
    public.is_league_captain(auth.uid(), p_target_league_id)
    OR public.is_club_admin(auth.uid(), p_club_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to pull players into this league';
  END IF;

  v_same_gender_group :=
    (
      v_source_league.name ~* '\m(men|men''s)\M'
      AND v_target_league.name ~* '\m(men|men''s)\M'
      AND v_source_league.name !~* 'women'
      AND v_target_league.name !~* 'women'
    )
    OR (
      v_source_league.name ~* '(ladies|women)'
      AND v_target_league.name ~* '(ladies|women)'
    )
    OR (
      v_source_league.name !~* '\m(men|men''s)\M|women|ladies'
      AND v_target_league.name !~* '\m(men|men''s)\M|women|ladies'
    );

  SELECT platform_association_id INTO v_platform_association_id
  FROM public.league_associations
  WHERE id = v_target_league.association_id;

  SELECT COALESCE(lr.cross_gender_subs_allowed, false)
  INTO v_cross_gender_allowed
  FROM public.league_rules lr
  WHERE lr.association_id IN (v_target_league.association_id, v_platform_association_id)
  ORDER BY CASE WHEN lr.association_id = v_target_league.association_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_cross_gender_allowed := COALESCE(v_cross_gender_allowed, COALESCE(v_target_league.allow_cross_gender_guests, false));

  IF NOT v_same_gender_group AND NOT v_cross_gender_allowed AND NOT public.is_club_admin(auth.uid(), p_club_id) THEN
    RAISE EXCEPTION 'Cross-gender pulls are not enabled for this league';
  END IF;

  IF v_same_gender_group THEN
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY COALESCE(NULLIF(regexp_replace(COALESCE(code, name), '\D', '', 'g'), '')::int, 999), name) AS rn
      FROM public.leagues
      WHERE club_id = p_club_id
        AND association_id IS NOT DISTINCT FROM v_target_league.association_id
        AND (
          (v_target_league.name ~* '\m(men|men''s)\M' AND name ~* '\m(men|men''s)\M' AND name !~* 'women')
          OR (v_target_league.name ~* '(ladies|women)' AND name ~* '(ladies|women)')
          OR (v_target_league.name !~* '\m(men|men''s)\M|women|ladies' AND name !~* '\m(men|men''s)\M|women|ladies')
        )
    ), pair AS (
      SELECT src.rn AS src_rn, tgt.rn AS tgt_rn
      FROM ordered src
      CROSS JOIN ordered tgt
      WHERE src.id = p_source_league_id AND tgt.id = p_target_league_id
    )
    SELECT (tgt_rn = src_rn + 1) INTO v_is_natural_cascade
    FROM pair;
  END IF;

  v_cascaded_from := CASE WHEN COALESCE(v_is_natural_cascade, false) THEN NULL ELSE p_target_league_id END;

  DELETE FROM public.league_week_lineups
  WHERE club_id = p_club_id
    AND week_start_date = p_week_start_date
    AND club_member_id = p_club_member_id;

  INSERT INTO public.league_week_player_status
    (club_id, league_id, week_start_date, club_member_id, status, cascaded_from_league_id)
  VALUES
    (p_club_id, p_source_league_id, p_week_start_date, p_club_member_id, 'excess', v_cascaded_from)
  ON CONFLICT (league_id, week_start_date, club_member_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    cascaded_from_league_id = EXCLUDED.cascaded_from_league_id,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_player_to_league_pool(uuid, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_player_to_league_pool(uuid, date, uuid, uuid, uuid) TO service_role;