
-- Broaden write access on league_match_results so any member of a participating
-- club can act as marker (previously captain/admin only, which silently dropped
-- score updates from regular players acting as markers).

DROP POLICY IF EXISTS "Participating captains can insert match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Participating captains can update match results" ON public.league_match_results;

CREATE POLICY "Participating club members can insert match results"
  ON public.league_match_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM platform_league_fixtures plf
      JOIN leagues l ON (
        NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code)
        OR NULLIF(upper(l.code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(l.code), '') = upper(plf.away_team_code)
      )
      JOIN club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
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
      FROM platform_league_fixtures plf
      JOIN leagues l ON (
        NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code)
        OR NULLIF(upper(l.code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(l.code), '') = upper(plf.away_team_code)
      )
      JOIN club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
      WHERE plf.id = league_match_results.fixture_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM platform_league_fixtures plf
      JOIN leagues l ON (
        NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code)
        OR NULLIF(upper(l.code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(l.code), '') = upper(plf.away_team_code)
      )
      JOIN club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
      WHERE plf.id = league_match_results.fixture_id
    )
  );
