
-- Allow platform super admins (and any club admin) to create club events
-- on any tenant club, even when they don't have a club_members row there.

DROP POLICY IF EXISTS "Club members can create club events" ON public.club_events;
CREATE POLICY "Members or admins can create club events"
ON public.club_events
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND (
    is_club_member(auth.uid(), club_id)
    OR is_club_admin(auth.uid(), club_id)
  )
);

-- Allow super admins / club admins to create bookings on any tenant club.
DROP POLICY IF EXISTS "Users can create bookings" ON public.bookings;
CREATE POLICY "Users can create bookings"
ON public.bookings
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    club_id IS NULL
    OR is_club_member(auth.uid(), club_id)
    OR is_club_admin(auth.uid(), club_id)
  )
);
