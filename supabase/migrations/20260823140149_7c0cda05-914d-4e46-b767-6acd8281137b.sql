CREATE OR REPLACE FUNCTION public.create_league_season(
  p_association_id uuid,
  p_season_year integer,
  p_label text DEFAULT NULL,
  p_starts_on date DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_make_current boolean DEFAULT true,
  p_copy_teams boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_season_id uuid;
  v_prev_season_id uuid;
  v_label text;
BEGIN
  SELECT club_id INTO v_club_id
  FROM public.league_associations
  WHERE id = p_association_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'League association not found';
  END IF;

  IF NOT (public.is_club_admin(auth.uid(), v_club_id)
          OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to create seasons for this league';
  END IF;

  IF p_season_year IS NULL OR p_season_year < 1900 OR p_season_year > 2200 THEN
    RAISE EXCEPTION 'Invalid season year';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.league_seasons
    WHERE association_id = p_association_id AND season_year = p_season_year
  ) THEN
    RAISE EXCEPTION 'A % season already exists for this league', p_season_year;
  END IF;

  v_label := COALESCE(NULLIF(btrim(p_label), ''), p_season_year::text);

  SELECT id INTO v_prev_season_id
  FROM public.league_seasons
  WHERE association_id = p_association_id AND is_current
  LIMIT 1;

  IF p_make_current AND v_prev_season_id IS NOT NULL THEN
    UPDATE public.league_seasons
    SET is_current = false, updated_at = now()
    WHERE id = v_prev_season_id;
  END IF;

  INSERT INTO public.league_seasons (
    association_id, club_id, season_year, label, status, is_current, starts_on, ends_on
  ) VALUES (
    p_association_id, v_club_id, p_season_year, v_label,
    CASE WHEN p_make_current THEN 'active' ELSE 'planned' END,
    COALESCE(p_make_current, false), p_starts_on, p_ends_on
  )
  RETURNING id INTO v_season_id;

  -- Roll the previous season's teams forward as NEW rows. Nothing historical is
  -- rewritten: past fixtures keep pointing at the old team rows and snapshots.
  IF p_copy_teams AND v_prev_season_id IS NOT NULL THEN
    INSERT INTO public.leagues (
      club_id, association_id, name, code, nsa_team_id, nsa_team_code,
      allow_cross_gender_guests, reserves_per_team, logo_url,
      affects_ranking_points, season_year, level, is_reserve,
      level_source, season_source, season_id, division, category
    )
    SELECT
      l.club_id, l.association_id, l.name, l.code, l.nsa_team_id, l.nsa_team_code,
      l.allow_cross_gender_guests, l.reserves_per_team, l.logo_url,
      l.affects_ranking_points, p_season_year, l.level, l.is_reserve,
      l.level_source, 'season_rollover', v_season_id, l.division, l.category
    FROM public.leagues l
    WHERE l.association_id = p_association_id
      AND l.season_id = v_prev_season_id
      AND l.archived_at IS NULL;
  END IF;

  RETURN v_season_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_league_season(uuid, integer, text, date, date, boolean, boolean) TO authenticated;