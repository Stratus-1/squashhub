-- Season fixture builder persistence.
-- Association administrators may rebuild only their own platform season schedules.
CREATE OR REPLACE FUNCTION public.association_save_season_fixtures(
  _tenant_id uuid,
  _platform_association_id uuid,
  _season_id uuid,
  _fixtures jsonb,
  _replace_unplayed boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.league_seasons
    WHERE id = _season_id AND platform_association_id = _platform_association_id
  ) THEN
    RAISE EXCEPTION 'Season is not owned by this association';
  END IF;

  IF _replace_unplayed THEN
    DELETE FROM public.platform_league_fixtures
    WHERE association_id = _platform_association_id
      AND season_id = _season_id
      AND COALESCE(status, 'scheduled') NOT IN ('completed', 'played', 'scored');
  END IF;

  INSERT INTO public.platform_league_fixtures
    (association_id, season_id, fixture_date, venue_name, home_team_code, away_team_code, division,
     home_team_id, away_team_id, home_team_name_snapshot, away_team_name_snapshot, status)
  SELECT _platform_association_id, _season_id,
         (f->>'fixture_date')::date,
         COALESCE(f->>'venue_name', ''),
         COALESCE(f->>'home_team_code', ''), COALESCE(f->>'away_team_code', ''),
         COALESCE(f->>'division', ''),
         NULLIF(f->>'home_team_id', '')::uuid, NULLIF(f->>'away_team_id', '')::uuid,
         f->>'home_team_name', f->>'away_team_name', 'scheduled'
  FROM jsonb_array_elements(COALESCE(_fixtures, '[]'::jsonb)) f;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.association_save_season_fixtures(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.association_save_season_fixtures(uuid, uuid, uuid, jsonb, boolean) TO authenticated, service_role;