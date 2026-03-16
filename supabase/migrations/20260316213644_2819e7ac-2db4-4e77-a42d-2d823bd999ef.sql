-- Allow anonymous users to read club delegate members (chairman, secretary, captain)
CREATE POLICY "Anyone can view club delegates"
ON public.club_members
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = club_id
      AND (c.chairman_member_id = id OR c.secretary_member_id = id OR c.club_captain_member_id = id)
  )
);