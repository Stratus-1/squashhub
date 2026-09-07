-- Participants (booker, opponent, linked family members) and club admins may update/cancel bookings.
DROP POLICY IF EXISTS "Booking participants can update bookings" ON public.bookings;
CREATE POLICY "Booking participants can update bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR auth.uid() = opponent_id
  OR (club_member_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.id = bookings.club_member_id AND cm.user_id = auth.uid()))
  OR (opponent_member_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.id = bookings.opponent_member_id AND cm.user_id = auth.uid()))
  OR (club_id IS NOT NULL AND (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid())))
)
WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() = opponent_id
  OR (club_member_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.id = bookings.club_member_id AND cm.user_id = auth.uid()))
  OR (opponent_member_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.id = bookings.opponent_member_id AND cm.user_id = auth.uid()))
  OR (club_id IS NOT NULL AND (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid())))
);