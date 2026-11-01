CREATE OR REPLACE FUNCTION public.is_league_fixture_club_member(_uid uuid, _fixture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT upper(home_team_code) h, upper(away_team_code) a FROM platform_league_fixtures WHERE id = _fixture_id
  ), lc AS (
    SELECT l.club_id FROM leagues l, f WHERE upper(l.nsa_team_code) IN (f.h, f.a) AND l.nsa_team_code <> ''
    UNION
    SELECT l.club_id FROM leagues l, f WHERE upper(l.code) IN (f.h, f.a) AND l.code <> ''
  )
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM club_members cm JOIN lc ON lc.club_id = cm.club_id WHERE cm.user_id = _uid
  );
$$;