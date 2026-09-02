DROP POLICY IF EXISTS "captains/admins delete week unavailability" ON public.league_week_unavailability;

CREATE POLICY "captains/admins delete week unavailability"
ON public.league_week_unavailability
FOR DELETE
TO authenticated
USING (
  public.is_club_admin(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.club_members cm ON cm.id = l.captain_member_id
    WHERE l.club_id = league_week_unavailability.club_id AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.member_league_registrations mlr
    JOIN public.club_members cm2 ON cm2.id = mlr.club_member_id
    WHERE mlr.is_captain = true
      AND cm2.user_id = auth.uid()
      AND cm2.club_id = league_week_unavailability.club_id
  )
);