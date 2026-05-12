DROP POLICY IF EXISTS "Participating club members can insert match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Participating club members can update match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Participating club members can insert fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Participating club members can update fixture results" ON public.league_fixture_results;

CREATE POLICY "Participating club members can insert match results"
ON public.league_match_results
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      upper(coalesce(l.nsa_team_code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
      OR upper(coalesce(l.code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
);

CREATE POLICY "Participating club members can update match results"
ON public.league_match_results
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      upper(coalesce(l.nsa_team_code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
      OR upper(coalesce(l.code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      upper(coalesce(l.nsa_team_code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
      OR upper(coalesce(l.code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
);

CREATE POLICY "Participating club members can insert fixture results"
ON public.league_fixture_results
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      upper(coalesce(l.nsa_team_code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
      OR upper(coalesce(l.code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
);

CREATE POLICY "Participating club members can update fixture results"
ON public.league_fixture_results
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      upper(coalesce(l.nsa_team_code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
      OR upper(coalesce(l.code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      upper(coalesce(l.nsa_team_code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
      OR upper(coalesce(l.code, '')) IN (upper(plf.home_team_code), upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
);