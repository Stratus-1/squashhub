CREATE OR REPLACE FUNCTION public.is_league_fixture_club_member(_uid uuid, _fixture_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT upper(home_team_code) h, upper(away_team_code) a FROM platform_league_fixtures WHERE id = _fixture_id
  ), lc AS (
    SELECT l.club_id FROM leagues l, f WHERE upper(l.nsa_team_code) IN (f.h, f.a)
    UNION
    SELECT l.club_id FROM leagues l, f WHERE upper(l.code) IN (f.h, f.a)
  )
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM club_members cm JOIN lc ON lc.club_id = cm.club_id WHERE cm.user_id = _uid
  );
$$;
REVOKE ALL ON FUNCTION public.is_league_fixture_club_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_league_fixture_club_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Participating club members can view match results" ON public.league_match_results;
CREATE POLICY "Participating club members can view match results" ON public.league_match_results
  FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role) OR public.is_league_fixture_club_member((select auth.uid()), fixture_id));

DROP POLICY IF EXISTS "Participating club members can insert match results" ON public.league_match_results;
CREATE POLICY "Participating club members can insert match results" ON public.league_match_results
  FOR INSERT TO authenticated
  WITH CHECK (public.is_league_fixture_club_member((select auth.uid()), fixture_id));

DROP POLICY IF EXISTS "Participating club members can update match results" ON public.league_match_results;
CREATE POLICY "Participating club members can update match results" ON public.league_match_results
  FOR UPDATE TO authenticated
  USING (public.is_league_fixture_club_member((select auth.uid()), fixture_id))
  WITH CHECK (public.is_league_fixture_club_member((select auth.uid()), fixture_id));