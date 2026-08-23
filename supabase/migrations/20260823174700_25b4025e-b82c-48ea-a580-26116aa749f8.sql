DROP POLICY IF EXISTS "Club members can view their club pairs" ON public.league_team_pairs;

CREATE POLICY "Club members and admins can view club pairs"
ON public.league_team_pairs
FOR SELECT
TO authenticated
USING (
  public.is_club_member(auth.uid(), club_id)
  OR public.is_club_admin(auth.uid(), club_id)
);