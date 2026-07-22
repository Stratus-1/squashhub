
CREATE POLICY "Club admins can update block bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    club_id IS NOT NULL
    AND source IN ('club_event', 'league')
    AND (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
  )
  WITH CHECK (
    club_id IS NOT NULL
    AND (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
  );

CREATE POLICY "Club admins can delete block bookings"
  ON public.bookings
  FOR DELETE
  USING (
    club_id IS NOT NULL
    AND source IN ('club_event', 'league')
    AND (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
  );
