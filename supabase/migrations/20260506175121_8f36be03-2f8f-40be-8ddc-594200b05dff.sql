DROP POLICY IF EXISTS "Club members can view all club registrations" ON member_league_registrations;

CREATE POLICY "Club members and super admins can view registrations"
ON member_league_registrations
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.id = member_league_registrations.club_member_id
      AND is_club_member(auth.uid(), cm.club_id)
  )
);