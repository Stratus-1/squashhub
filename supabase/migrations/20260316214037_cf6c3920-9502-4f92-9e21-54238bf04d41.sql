-- Drop the buggy policy
DROP POLICY "Anyone can view club delegates" ON public.club_members;

-- Recreate with correct column references
CREATE POLICY "Anyone can view club delegates"
ON public.club_members
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = club_members.club_id
      AND (c.chairman_member_id = club_members.id OR c.secretary_member_id = club_members.id OR c.club_captain_member_id = club_members.id)
  )
);