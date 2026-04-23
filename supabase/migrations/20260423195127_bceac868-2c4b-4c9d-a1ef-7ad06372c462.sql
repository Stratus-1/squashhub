-- Allow all club members to view league registrations of fellow club members
-- (read-only — only captains/admins can still modify)

DROP POLICY IF EXISTS "Members can view own registrations" ON public.member_league_registrations;

CREATE POLICY "Club members can view all club registrations"
ON public.member_league_registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = member_league_registrations.club_member_id
      AND public.is_club_member(auth.uid(), cm.club_id)
  )
);