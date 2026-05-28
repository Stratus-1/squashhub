-- Fix RLS performance issue: the "Opposing captains can view fixture registrations"
-- policy on member_league_registrations does a 4-way join (club_members, leagues,
-- platform_league_fixtures, leagues, club_members) for every candidate row. With
-- thousands of registrations this exceeds the statement timeout for non-super-admin
-- users (e.g. team captains), returning 500. Super-admins never hit it because the
-- sibling "Club members and super admins can view registrations" policy short-circuits
-- via has_role(...,'admin').
--
-- Replace it with a SECURITY DEFINER function that answers the same question much
-- more cheaply, scoped to the single row's league_id and club_member_id.

CREATE OR REPLACE FUNCTION public.viewer_is_opposing_captain_for_registration(
  _viewer_user_id uuid,
  _reg_league_id uuid,
  _reg_club_member_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Does the viewer captain/admin a league in the same club that is scheduled
  -- to play against the registration's league (matched by nsa_team_code or code)?
  SELECT EXISTS (
    SELECT 1
      FROM public.leagues reg_league
      JOIN public.platform_league_fixtures plf
        ON (
          NULLIF(upper(reg_league.nsa_team_code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code))
          OR NULLIF(upper(reg_league.code), '')      IN (upper(plf.home_team_code), upper(plf.away_team_code))
        )
      JOIN public.leagues other_league
        ON other_league.id <> reg_league.id
       AND (
          NULLIF(upper(other_league.nsa_team_code), '') IN (upper(plf.home_team_code), upper(plf.away_team_code))
          OR NULLIF(upper(other_league.code), '')      IN (upper(plf.home_team_code), upper(plf.away_team_code))
        )
      JOIN public.club_members viewer_cm
        ON viewer_cm.club_id = other_league.club_id
       AND viewer_cm.user_id = _viewer_user_id
       AND viewer_cm.role IN ('admin'::club_member_role, 'captain'::club_member_role)
     WHERE reg_league.id = _reg_league_id
     LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.viewer_is_opposing_captain_for_registration(uuid, uuid, uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Opposing captains can view fixture registrations" ON public.member_league_registrations;

CREATE POLICY "Opposing captains can view fixture registrations"
  ON public.member_league_registrations
  FOR SELECT
  USING (
    public.viewer_is_opposing_captain_for_registration(
      auth.uid(),
      league_id,
      club_member_id
    )
  );