CREATE POLICY "Club admins can create block bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  club_id IS NOT NULL
  AND is_club_admin(auth.uid(), club_id)
);