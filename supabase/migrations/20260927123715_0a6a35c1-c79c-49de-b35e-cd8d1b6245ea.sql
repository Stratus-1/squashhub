CREATE OR REPLACE FUNCTION public.copy_league_season_teams(p_season_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season public.league_seasons%ROWTYPE;
  v_source_season_id uuid;
  v_copied integer;
BEGIN
  SELECT * INTO v_season FROM public.league_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  IF NOT (public.is_club_admin(auth.uid(), v_season.club_id)
          OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to copy teams for this league';
  END IF;

  -- Source: the closest earlier season of the same league that actually has teams.
  SELECT s.id INTO v_source_season_id
  FROM public.league_seasons s
  JOIN public.leagues l ON l.season_id = s.id AND l.archived_at IS NULL
  WHERE s.association_id = v_season.association_id
    AND s.season_year < v_season.season_year
  GROUP BY s.id
  ORDER BY s.season_year DESC
  LIMIT 1;

  IF v_source_season_id IS NULL THEN
    RAISE EXCEPTION 'No earlier season with teams to copy from';
  END IF;

  -- Only an empty season can receive a copy, so this can never duplicate teams.
  IF EXISTS (
    SELECT 1 FROM public.leagues
    WHERE association_id = v_season.association_id
      AND season_id = p_season_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This season already has teams';
  END IF;

  INSERT INTO public.leagues (
    club_id, association_id, name, code, nsa_team_id, nsa_team_code,
    allow_cross_gender_guests, reserves_per_team, logo_url,
    affects_ranking_points, season_year, level, is_reserve,
    level_source, season_source, season_id, division, category
  )
  SELECT
    l.club_id, l.association_id, l.name, l.code, l.nsa_team_id, l.nsa_team_code,
    l.allow_cross_gender_guests, l.reserves_per_team, l.logo_url,
    l.affects_ranking_points, v_season.season_year, l.level, l.is_reserve,
    l.level_source, 'season_rollover', p_season_id, l.division, l.category
  FROM public.leagues l
  WHERE l.season_id = v_source_season_id AND l.archived_at IS NULL;

  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RETURN v_copied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.copy_league_season_teams(uuid) TO authenticated;