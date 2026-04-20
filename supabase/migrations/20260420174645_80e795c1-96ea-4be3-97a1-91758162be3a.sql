DROP POLICY IF EXISTS "Club admins can update" ON public.clubs;

CREATE POLICY "Club admins or permitted can update"
ON public.clubs
FOR UPDATE
TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), id, 'club'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), id, 'club'));