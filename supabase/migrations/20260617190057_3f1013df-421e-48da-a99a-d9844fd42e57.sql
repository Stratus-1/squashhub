
DROP POLICY IF EXISTS "Participating captains can insert fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Participating captains can update fixture results" ON public.league_fixture_results;

CREATE POLICY "Participating club members can insert fixture results"
ON public.league_fixture_results
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM platform_league_fixtures plf
    JOIN leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN club_members cm ON (cm.club_id = l.club_id AND cm.user_id = auth.uid())
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
    FROM platform_league_fixtures plf
    JOIN leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN club_members cm ON (cm.club_id = l.club_id AND cm.user_id = auth.uid())
    WHERE plf.id = league_fixture_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM platform_league_fixtures plf
    JOIN leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN club_members cm ON (cm.club_id = l.club_id AND cm.user_id = auth.uid())
    WHERE plf.id = league_fixture_results.fixture_id
  )
);
