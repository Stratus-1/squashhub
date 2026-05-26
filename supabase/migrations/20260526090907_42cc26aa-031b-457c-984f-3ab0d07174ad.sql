
-- Allow captains/admins of either team in a fixture to view the opposing team's
-- league registrations. Needed so the scorecard prefill, captain badge, and
-- live roster overlay can load both sides regardless of which captain is signed in.
CREATE POLICY "Opposing captains can view fixture registrations"
ON public.member_league_registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members reg_cm
    JOIN public.leagues reg_league
      ON reg_league.id = member_league_registrations.league_id
    JOIN public.platform_league_fixtures plf
      ON (
        NULLIF(upper(reg_league.nsa_team_code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(reg_league.nsa_team_code), '') = upper(plf.away_team_code)
        OR NULLIF(upper(reg_league.code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(reg_league.code), '') = upper(plf.away_team_code)
      )
    JOIN public.leagues other_league
      ON (
        NULLIF(upper(other_league.nsa_team_code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(other_league.nsa_team_code), '') = upper(plf.away_team_code)
        OR NULLIF(upper(other_league.code), '') = upper(plf.home_team_code)
        OR NULLIF(upper(other_league.code), '') = upper(plf.away_team_code)
      )
    JOIN public.club_members viewer_cm
      ON viewer_cm.club_id = other_league.club_id
     AND viewer_cm.user_id = auth.uid()
    WHERE reg_cm.id = member_league_registrations.club_member_id
      AND viewer_cm.role IN ('admin'::club_member_role, 'captain'::club_member_role)
  )
);
