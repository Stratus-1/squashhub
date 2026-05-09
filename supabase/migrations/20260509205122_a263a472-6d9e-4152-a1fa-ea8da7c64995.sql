
-- league_fixture_results: allow any member of a participating club to write
DROP POLICY IF EXISTS "Captains and admins can insert fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Captains and admins can update fixture results" ON public.league_fixture_results;

CREATE POLICY "Participating club members can insert fixture results"
ON public.league_fixture_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
);

CREATE POLICY "Participating club members can update fixture results"
ON public.league_fixture_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
);

-- league_match_results: same relaxation
DROP POLICY IF EXISTS "Captains and admins can insert match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Captains and admins can update match results" ON public.league_match_results;

CREATE POLICY "Participating club members can insert match results"
ON public.league_match_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
);

CREATE POLICY "Participating club members can update match results"
ON public.league_match_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
);
